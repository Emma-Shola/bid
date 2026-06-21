import type { ResumePreviewModel } from "@/lib/resume-preview";
import { Bullet } from "./Bullet";
import { SectionHeading } from "./SectionHeading";

type CertificatesSectionProps = Pick<ResumePreviewModel, "certificates">;

export function CertificatesSection({ certificates }: CertificatesSectionProps) {
  if (certificates.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2">
      <SectionHeading>Certificates</SectionHeading>
      <div className="space-y-1 pt-0.5">
        {certificates.map((certificate, index) => (
          <Bullet key={`${certificate}-${index}`}>{certificate}</Bullet>
        ))}
      </div>
    </section>
  );
}

