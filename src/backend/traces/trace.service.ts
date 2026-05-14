import { reasoningTraceSchema } from "../shared/schemas/trace.zod";
import type { ReasoningTrace } from "../shared/types/trace";
import type { TraceRepository } from "./trace.repository";
import { createTraceRepository } from "./trace.repository";

export interface TraceService {
  storeTrace(trace: ReasoningTrace): Promise<ReasoningTrace>;
}

export class DefaultTraceService implements TraceService {
  constructor(private readonly repository: TraceRepository = createTraceRepository()) {}

  async storeTrace(trace: ReasoningTrace): Promise<ReasoningTrace> {
    const validatedTrace = reasoningTraceSchema.parse(trace);
    return this.repository.createTrace(validatedTrace);
  }
}

export function createTraceService(repository?: TraceRepository): TraceService {
  return new DefaultTraceService(repository);
}
