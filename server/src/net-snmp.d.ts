declare module 'net-snmp' {
  export const Version1: number;
  export const Version2c: number;
  export const Version3: number;

  export type Varbind = {
    oid: string;
    type: number;
    value: unknown;
  };

  export type Session = {
    get(oids: string[], cb: (err: Error | null, varbinds: Varbind[]) => void): void;
    walk(
      oid: string,
      maxRepetitions: number,
      feedCb: (varbinds: Varbind[]) => void,
      doneCb: (err: Error | null) => void,
    ): void;
    subtree(
      oid: string,
      maxRepetitions: number,
      feedCb: (varbinds: Varbind[]) => void,
      doneCb: (err: Error | null) => void,
    ): void;
    close(): void;
  };

  export function createSession(
    target: string,
    community: string,
    options?: {
      port?: number;
      retries?: number;
      timeout?: number;
      version?: number;
      transport?: 'udp4' | 'udp6';
      sourceAddress?: string;
      sourcePort?: number;
    },
  ): Session;

  export function isVarbindError(vb: Varbind): boolean;
  export function varbindError(vb: Varbind): string;
}
