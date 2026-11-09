namespace SchoolAdmission.Api.Models;

public sealed class SchoolClass
{
    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public int TotalSeats { get; set; }

    public ICollection<AdmissionHold> Holds { get; } = new List<AdmissionHold>();
}
