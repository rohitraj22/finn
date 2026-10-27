import { ArrowDownRight, ArrowUpRight, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Company, percent } from "@/lib/mock-data";
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Change({ value }: { value: number }) {
  return (
    <span className={`change ${value >= 0 ? "positive" : "negative"}`}>
      {value >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{" "}
      {percent(value)}
    </span>
  );
}
export function CompanyIcon({
  company,
}: {
  company: Pick<Company, "color" | "initials">;
}) {
  return (
    <span
      className="company-icon"
      style={{ color: company.color, background: `${company.color}12` }}
    >
      {company.initials}
    </span>
  );
}
export function SectionLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="text-link">
      {children}
      <ArrowRight size={15} />
    </Link>
  );
}
