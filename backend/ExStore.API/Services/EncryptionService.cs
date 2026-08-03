using System.Security.Cryptography;

namespace ExStore.API.Services;

/// <summary>
/// Provides per-user AES-256 file encryption.
/// Each user has a unique 256-bit key wrapped (encrypted) with the application master key using AES-256-GCM.
/// Files are encrypted with AES-256-CBC; the per-file IV is stored in blob metadata ("enc_iv").
/// </summary>
public class EncryptionService
{
    private readonly byte[] _masterKey;

    public const string IvMetadataKey = "enc_iv";

    public EncryptionService(IConfiguration config)
    {
        var base64 = config["Encryption:MasterKey"];

        if (string.IsNullOrWhiteSpace(base64))
            throw new InvalidOperationException(
                "Encryption:MasterKey is not configured. " +
                "Set it in appsettings.json (development) or via the " +
                "Encryption__MasterKey environment variable (production).");

        _masterKey = Convert.FromBase64String(base64);

        if (_masterKey.Length != 32)
            throw new InvalidOperationException("Encryption:MasterKey must decode to exactly 32 bytes (256-bit)");
    }

    /// <summary>Generate a new random 256-bit user key.</summary>
    public byte[] GenerateKey()
    {
        var key = new byte[32];
        RandomNumberGenerator.Fill(key);
        return key;
    }

    /// <summary>
    /// Wrap (encrypt) a user's 32-byte AES key using the application master key (AES-256-GCM).
    /// Returns a base64-encoded string safe to store in the user record.
    /// </summary>
    public string WrapKey(byte[] userKey)
    {
        if (userKey.Length != 32)
            throw new ArgumentException("User key must be 32 bytes", nameof(userKey));

        var nonce = new byte[12];
        RandomNumberGenerator.Fill(nonce);

        var ciphertext = new byte[userKey.Length];
        var tag = new byte[16];

        using var aesGcm = new AesGcm(_masterKey, tag.Length);
        aesGcm.Encrypt(nonce, userKey, ciphertext, tag);

        // Layout: [12-byte nonce][16-byte tag][32-byte ciphertext] = 60 bytes
        var combined = new byte[nonce.Length + tag.Length + ciphertext.Length];
        Buffer.BlockCopy(nonce, 0, combined, 0, nonce.Length);
        Buffer.BlockCopy(tag, 0, combined, nonce.Length, tag.Length);
        Buffer.BlockCopy(ciphertext, 0, combined, nonce.Length + tag.Length, ciphertext.Length);

        return Convert.ToBase64String(combined);
    }

    /// <summary>Unwrap (decrypt) a user key previously wrapped with <see cref="WrapKey"/>.</summary>
    public byte[] UnwrapKey(string wrappedKey)
    {
        var combined = Convert.FromBase64String(wrappedKey);
        const int nonceSize = 12;
        const int tagSize = 16;
        var ciphertextSize = combined.Length - nonceSize - tagSize;

        if (ciphertextSize <= 0)
            throw new CryptographicException("Invalid wrapped key format");

        var nonce = combined.AsSpan(0, nonceSize);
        var tag = combined.AsSpan(nonceSize, tagSize);
        var ciphertext = combined.AsSpan(nonceSize + tagSize, ciphertextSize);

        var plaintext = new byte[ciphertextSize];

        using var aesGcm = new AesGcm(_masterKey, tagSize);
        aesGcm.Decrypt(nonce, ciphertext, tag, plaintext);

        return plaintext;
    }

    /// <summary>
    /// Create a CryptoStream that encrypts data read from <paramref name="plainSource"/> using AES-256-CBC.
    /// The caller MUST store the returned IV (16 bytes) in blob metadata before uploading,
    /// so it can be retrieved during decryption.
    /// </summary>
    public (Stream encryptingStream, byte[] iv) CreateEncryptingReadStream(Stream plainSource, byte[] userKey)
    {
        if (userKey.Length != 32) throw new ArgumentException("Key must be 32 bytes", nameof(userKey));

        using var aes = Aes.Create();
        aes.Key = userKey;
        aes.GenerateIV();
        aes.Mode = CipherMode.CBC;
        aes.Padding = PaddingMode.PKCS7;

        var iv = (byte[])aes.IV.Clone();
        // CryptoStreamMode.Read: when the caller reads from this stream it reads from plainSource and encrypts on-the-fly
        var encryptor = aes.CreateEncryptor();
        var cryptoStream = new CryptoStream(plainSource, encryptor, CryptoStreamMode.Read, leaveOpen: false);

        return (cryptoStream, iv);
    }

    /// <summary>
    /// Create a CryptoStream that decrypts data read from <paramref name="encryptedSource"/> using AES-256-CBC.
    /// </summary>
    public Stream CreateDecryptingReadStream(Stream encryptedSource, byte[] userKey, byte[] iv)
    {
        if (userKey.Length != 32) throw new ArgumentException("Key must be 32 bytes", nameof(userKey));
        if (iv.Length != 16) throw new ArgumentException("IV must be 16 bytes", nameof(iv));

        using var aes = Aes.Create();
        aes.Key = userKey;
        aes.IV = iv;
        aes.Mode = CipherMode.CBC;
        aes.Padding = PaddingMode.PKCS7;

        var decryptor = aes.CreateDecryptor();
        return new CryptoStream(encryptedSource, decryptor, CryptoStreamMode.Read, leaveOpen: false);
    }

    /// <summary>AES-CBC block size in bytes.</summary>
    public const int BlockSize = 16;

    /// <summary>
    /// Create a CBC decrypting stream with NO padding removal. Used for random-access range
    /// decryption where the requested byte range is trimmed by the caller, so PKCS7 padding on
    /// the final block must not be auto-stripped (and interior blocks have no padding).
    /// <paramref name="iv"/> is the stored IV (block 0) or the cipher block immediately preceding
    /// the first block being decrypted.
    /// </summary>
    public Stream CreateDecryptingReadStreamNoPadding(Stream encryptedSource, byte[] userKey, byte[] iv)
    {
        if (userKey.Length != 32) throw new ArgumentException("Key must be 32 bytes", nameof(userKey));
        if (iv.Length != BlockSize) throw new ArgumentException("IV must be 16 bytes", nameof(iv));

        using var aes = Aes.Create();
        aes.Key = userKey;
        aes.IV = iv;
        aes.Mode = CipherMode.CBC;
        aes.Padding = PaddingMode.None;

        var decryptor = aes.CreateDecryptor();
        return new CryptoStream(encryptedSource, decryptor, CryptoStreamMode.Read, leaveOpen: false);
    }

    /// <summary>
    /// Decrypt the final cipher block to read its PKCS7 padding length (1..16).
    /// <paramref name="prevBlockOrIv"/> is the preceding cipher block, or the stored IV when the
    /// file is a single block. Returns 0 if the padding value is invalid.
    /// </summary>
    public int GetPkcs7PadLength(byte[] lastCipherBlock, byte[] prevBlockOrIv, byte[] userKey)
    {
        using var aes = Aes.Create();
        aes.Key = userKey;
        aes.Mode = CipherMode.CBC;
        aes.Padding = PaddingMode.None;
        aes.IV = prevBlockOrIv;

        using var decryptor = aes.CreateDecryptor();
        var plain = decryptor.TransformFinalBlock(lastCipherBlock, 0, BlockSize);
        int pad = plain[BlockSize - 1];
        return pad is >= 1 and <= BlockSize ? pad : 0;
    }
}
