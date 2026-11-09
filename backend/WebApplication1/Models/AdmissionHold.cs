namespace SchoolAdmission.Api.Models;

public static class HoldStatuses
{
    public const string Held = "HELD";
    public const string Confirmed = "CONFIRMED";
    public const string Expired = "EXPIRED";
    public const string Cancelled = "CANCELLED";
}

public sealed class AdmissionHold
{
    public string Id { get; set; } = string.Empty;

    public string ClassId { get; set; } = string.Empty;

    public SchoolClass Class { get; set; } = null!;

    public string StudentId { get; set; } = string.Empty;

    public string Status { get; set; } = HoldStatuses.Held;

    public DateTimeOffset? ExpiresAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
