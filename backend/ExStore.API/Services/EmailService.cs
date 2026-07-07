using Azure;
using Azure.Communication.Email;

namespace ExStore.API.Services;

public interface IEmailService
{
    Task SendVerificationEmailAsync(string toEmail, string toName, string verificationUrl);
}

public class EmailService : IEmailService
{
    private readonly IConfiguration _config;
    private readonly ILogger<EmailService> _logger;

    public EmailService(IConfiguration config, ILogger<EmailService> logger)
    {
        _config = config;
        _logger = logger;
    }

    public async Task SendVerificationEmailAsync(string toEmail, string toName, string verificationUrl)
    {
        var connectionString = _config["AzureCommunicationServices:ConnectionString"];

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            // Dev fallback: log the URL so local dev works without ACS
            _logger.LogWarning(
                "ACS connection string not configured. Verification URL for {Email}: {Url}",
                toEmail, verificationUrl);
            return;
        }

        var senderAddress = _config["AzureCommunicationServices:SenderAddress"]
            ?? "DoNotReply@azurecomm.net";

        var client = new EmailClient(connectionString);

        var message = new EmailMessage(
            senderAddress: senderAddress,
            content: new EmailContent("Verify your ExStore email address")
            {
                PlainText = $"Hi {toName},\n\nVerify your email by visiting:\n{verificationUrl}\n\nThis link expires in 24 hours.",
                Html = $"""
                    <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
                      <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
                        <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">ExStore</h1>
                      </div>
                      <h2 style="color:#1e293b;font-size:20px;margin-bottom:8px;">Verify your email address</h2>
                      <p style="color:#475569;margin-bottom:24px;">Hi {toName}, click the button below to verify your email and continue with your registration.</p>
                      <a href="{verificationUrl}"
                         style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">
                        Verify Email Address
                      </a>
                      <p style="color:#94a3b8;font-size:12px;margin-top:24px;">
                        This link expires in 24 hours. If you didn't register for ExStore, you can safely ignore this email.
                      </p>
                    </div>
                    """
            },
            recipients: new EmailRecipients(new[] { new EmailAddress(toEmail, toName) })
        );

        try
        {
            var operation = await client.SendAsync(WaitUntil.Started, message);
            _logger.LogInformation("ACS email queued. OperationId: {Id}", operation.Id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send verification email to {Email}", toEmail);
        }
    }
}
