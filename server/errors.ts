export class PlannerError extends Error {
  status: number; code: string;
  constructor(message: string, status: number, code: string) { super(message); this.name='PlannerError'; this.status=status; this.code=code; }
}
