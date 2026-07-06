namespace ExStore.API.Services;

/// <summary>
/// Validates uploaded file content against magic bytes to block disguised executables and scripts.
/// Uses a blocklist approach: all files are allowed unless they match a known dangerous signature.
/// Returns a reconstituted stream with the peeked header bytes prepended back.
/// </summary>
public static class FileTypeValidator
{
    public static async Task<(string? Error, Stream ReconstitutedStream)> ValidateAsync(
        Stream body, CancellationToken ct = default)
    {
        // Peek at first 16 bytes without consuming the stream
        var header = new byte[16];
        int totalRead = 0;
        while (totalRead < header.Length)
        {
            int n = await body.ReadAsync(header.AsMemory(totalRead, header.Length - totalRead), ct);
            if (n == 0) break;
            totalRead += n;
        }

        var magic = header.AsSpan(0, totalRead);

        if (IsExecutable(magic))
            return ("Executable files (PE/ELF binaries) are not allowed.", Stream.Null);

        if (IsScript(magic))
            return ("Script files are not allowed.", Stream.Null);

        if (IsHtml(magic))
            return ("HTML files are not allowed.", Stream.Null);

        // Reconstruct the stream: prepend the already-read header back onto the body
        var prefix = new MemoryStream(header, 0, totalRead, writable: false);
        return (null, new ConcatenatedStream(prefix, body));
    }

    // Windows PE (MZ) or ELF
    private static bool IsExecutable(ReadOnlySpan<byte> m) =>
        (m.Length >= 2 && m[0] == 0x4D && m[1] == 0x5A) ||              // MZ
        (m.Length >= 4 && m[0] == 0x7F && m[1] == 0x45 &&
                          m[2] == 0x4C && m[3] == 0x46);                  // ELF

    // Unix shebangs (#!), PHP (<?), generic XML PI (<?)
    private static bool IsScript(ReadOnlySpan<byte> m) =>
        (m.Length >= 2 && m[0] == 0x23 && m[1] == 0x21) ||              // #!
        (m.Length >= 5 && m[0] == 0x3C && m[1] == 0x3F &&               // <?php / <?
            (m[2] == 0x70 || m[2] == 0x50 || m[2] == 0x78 || m[2] == 0x58));

    // HTML / DOCTYPE
    private static bool IsHtml(ReadOnlySpan<byte> m)
    {
        if (m.Length < 5) return false;
        var s = System.Text.Encoding.ASCII.GetString(m).ToLowerInvariant();
        return s.StartsWith("<html", StringComparison.Ordinal) ||
               s.StartsWith("<!doc", StringComparison.Ordinal);
    }
}

/// <summary>Reads first from <paramref name="first"/>, then transparently switches to <paramref name="second"/>.</summary>
internal sealed class ConcatenatedStream : Stream
{
    private readonly Stream _first;
    private readonly Stream _second;
    private bool _firstDone;

    public ConcatenatedStream(Stream first, Stream second)
    {
        _first = first;
        _second = second;
    }

    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => throw new NotSupportedException();
    public override long Position
    {
        get => throw new NotSupportedException();
        set => throw new NotSupportedException();
    }

    public override int Read(byte[] buffer, int offset, int count)
    {
        if (!_firstDone)
        {
            int n = _first.Read(buffer, offset, count);
            if (n > 0) return n;
            _firstDone = true;
        }
        return _second.Read(buffer, offset, count);
    }

    public override async Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken ct)
    {
        if (!_firstDone)
        {
            int n = await _first.ReadAsync(buffer.AsMemory(offset, count), ct);
            if (n > 0) return n;
            _firstDone = true;
        }
        return await _second.ReadAsync(buffer.AsMemory(offset, count), ct);
    }

    public override void Flush() { }
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

    protected override void Dispose(bool disposing)
    {
        if (disposing) { _first.Dispose(); _second.Dispose(); }
        base.Dispose(disposing);
    }
}
