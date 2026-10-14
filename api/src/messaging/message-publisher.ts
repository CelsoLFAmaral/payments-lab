import { EventEnvelope } from '../events/event-envelope';

export interface MessagePublisher {
  publish(routingKey: string, envelope: EventEnvelope<unknown>): Promise<void>;
}

export const MESSAGE_PUBLISHER = Symbol('MESSAGE_PUBLISHER');
