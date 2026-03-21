import { PatientStatus } from "@/lib/data";

const config: Record<
  PatientStatus,
  { bg: string; text: string; border: string }
> = {
  Pending: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  "In Progress": {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  Updated: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
};

export default function StatusBadge({ status }: { status: PatientStatus }) {
  const { bg, text, border } = config[status];
  return (
    <span
      className={`inline-block w-fit px-2 py-0.5 ${bg} ${text} rounded text-[10px] font-bold border ${border} uppercase tracking-tight`}
    >
      {status}
    </span>
  );
}
