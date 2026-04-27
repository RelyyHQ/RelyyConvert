import type { FileStatus } from "./model";

type BadgeProps = {
  status: FileStatus;
  progress?: number;
};

export default function Badge({ status, progress = 0 }: BadgeProps) {
  return (
    <span className={`badge badge-${status}`}>
      {status === "converting" || status === "probing" ? <span className="pulse-dot" /> : null}
      {status === "converting" ? `${progress}%` : status}
    </span>
  );
}
