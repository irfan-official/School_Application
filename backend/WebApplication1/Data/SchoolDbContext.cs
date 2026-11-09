using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Models;

namespace SchoolAdmission.Api.Data;

public sealed class SchoolDbContext(DbContextOptions<SchoolDbContext> options) : DbContext(options)
{
    public DbSet<SchoolClass> Classes => Set<SchoolClass>();

    public DbSet<AdmissionHold> Holds => Set<AdmissionHold>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SchoolClass>(entity =>
        {
            entity.ToTable("Classes", table =>
            {
                table.HasCheckConstraint("CK_Classes_TotalSeats_Positive", "\"TotalSeats\" > 0");
            });
            entity.HasKey(schoolClass => schoolClass.Id);
            entity.Property(schoolClass => schoolClass.Id).HasMaxLength(40);
            entity.Property(schoolClass => schoolClass.Name).HasMaxLength(120).IsRequired();
        });

        modelBuilder.Entity<AdmissionHold>(entity =>
        {
            entity.ToTable("Holds", table =>
            {
                table.HasCheckConstraint(
                    "CK_Holds_Status_Valid",
                    "\"Status\" IN ('HELD', 'CONFIRMED', 'EXPIRED', 'CANCELLED')");
            });
            entity.HasKey(hold => hold.Id);
            entity.Property(hold => hold.Id).HasMaxLength(40);
            entity.Property(hold => hold.ClassId).HasMaxLength(40).IsRequired();
            entity.Property(hold => hold.StudentId).HasMaxLength(17).IsRequired();
            entity.Property(hold => hold.Status).HasMaxLength(12).IsRequired();
            entity.HasOne(hold => hold.Class)
                .WithMany(schoolClass => schoolClass.Holds)
                .HasForeignKey(hold => hold.ClassId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(hold => new { hold.ClassId, hold.StudentId })
                .IsUnique()
                .HasFilter("\"Status\" IN ('HELD', 'CONFIRMED')")
                .HasDatabaseName("UX_Holds_ActiveStudentClass");
            entity.HasIndex(hold => new { hold.Status, hold.ExpiresAt });
            entity.HasIndex(hold => new { hold.StudentId, hold.CreatedAt });
        });
    }
}
