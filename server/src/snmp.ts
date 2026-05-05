import * as snmp from 'net-snmp';

const OID_IF_DESCR = '1.3.6.1.2.1.2.2.1.2';
const OID_IF_OPER_STATUS = '1.3.6.1.2.1.2.2.1.8';
const OID_IF_PHYS_ADDR = '1.3.6.1.2.1.2.2.1.6';
const OID_IF_HC_IN_OCTETS = '1.3.6.1.2.1.31.1.1.1.6';
const OID_IF_HC_OUT_OCTETS = '1.3.6.1.2.1.31.1.1.1.10';
const OID_IF_HIGH_SPEED = '1.3.6.1.2.1.31.1.1.1.15';
const OID_IF_ALIAS = '1.3.6.1.2.1.31.1.1.1.18';

export type SnmpInterface = {
  ifIndex: number;
  ifName: string;
  ifAlias: string;
  ifPhysAddr: string;
  ifOperStatus: number; // 1 = up
  ifHighSpeedMbps: number;
};

export type SnmpCounters = {
  ifIndex: number;
  rxOctets: number;
  txOctets: number;
};

function counter64ToNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (Buffer.isBuffer(value)) {
    if (value.length === 0) return 0;
    if (value.length === 8) return Number(value.readBigUInt64BE(0));
    if (value.length < 8) {
      const padded = Buffer.alloc(8);
      value.copy(padded, 8 - value.length);
      return Number(padded.readBigUInt64BE(0));
    }
  }
  if (typeof value === 'bigint') return Number(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function macFromBuf(value: unknown): string {
  if (Buffer.isBuffer(value) && value.length === 6) {
    return [...value].map((b) => b.toString(16).padStart(2, '0')).join(':');
  }
  return '';
}

export type SnmpOpts = {
  host: string;
  community: string;
  port: number;
};

export class SnmpClient {
  private session: snmp.Session;

  constructor(opts: SnmpOpts) {
    this.session = snmp.createSession(opts.host, opts.community, {
      port: opts.port,
      version: snmp.Version2c,
      retries: 1,
      timeout: 2500,
      transport: 'udp4',
    });
  }

  close(): void {
    this.session.close();
  }

  /** Walk the interface table and return summary info for every interface. */
  async listInterfaces(): Promise<SnmpInterface[]> {
    const [descrs, aliases, opers, speeds, addrs] = await Promise.all([
      this.subtree(OID_IF_DESCR),
      this.subtree(OID_IF_ALIAS),
      this.subtree(OID_IF_OPER_STATUS),
      this.subtree(OID_IF_HIGH_SPEED),
      this.subtree(OID_IF_PHYS_ADDR),
    ]);
    const ifIndexes = new Set<number>();
    for (const d of descrs) ifIndexes.add(d.index);
    const out: SnmpInterface[] = [];
    for (const idx of ifIndexes) {
      const descr = descrs.find((x) => x.index === idx)?.value;
      const alias = aliases.find((x) => x.index === idx)?.value;
      const oper = opers.find((x) => x.index === idx)?.value;
      const speed = speeds.find((x) => x.index === idx)?.value;
      const addr = addrs.find((x) => x.index === idx)?.value;
      out.push({
        ifIndex: idx,
        ifName: typeof descr === 'string' ? descr : Buffer.isBuffer(descr) ? descr.toString() : String(descr ?? ''),
        ifAlias: typeof alias === 'string' ? alias : Buffer.isBuffer(alias) ? alias.toString() : String(alias ?? ''),
        ifPhysAddr: macFromBuf(addr),
        ifOperStatus: typeof oper === 'number' ? oper : 0,
        ifHighSpeedMbps: typeof speed === 'number' ? speed : 0,
      });
    }
    return out.sort((a, b) => a.ifIndex - b.ifIndex);
  }

  /** Get 64-bit input/output counters for the given interface indexes in one packet. */
  async getCounters(ifIndexes: number[]): Promise<SnmpCounters[]> {
    if (ifIndexes.length === 0) return [];
    const oids: string[] = [];
    for (const i of ifIndexes) {
      oids.push(`${OID_IF_HC_IN_OCTETS}.${i}`, `${OID_IF_HC_OUT_OCTETS}.${i}`);
    }
    const vbs = await this.get(oids);
    const out: SnmpCounters[] = [];
    for (const i of ifIndexes) {
      const inVb = vbs.find((v) => v.oid === `${OID_IF_HC_IN_OCTETS}.${i}`);
      const outVb = vbs.find((v) => v.oid === `${OID_IF_HC_OUT_OCTETS}.${i}`);
      out.push({
        ifIndex: i,
        rxOctets: inVb ? counter64ToNumber(inVb.value) : 0,
        txOctets: outVb ? counter64ToNumber(outVb.value) : 0,
      });
    }
    return out;
  }

  private get(oids: string[]): Promise<Array<{ oid: string; value: unknown }>> {
    return new Promise((resolve, reject) => {
      this.session.get(oids, (err: Error | null, varbinds: snmp.Varbind[]) => {
        if (err) return reject(err);
        const out: Array<{ oid: string; value: unknown }> = [];
        for (const vb of varbinds) {
          if (snmp.isVarbindError(vb)) {
            out.push({ oid: vb.oid, value: undefined });
          } else {
            out.push({ oid: vb.oid, value: vb.value });
          }
        }
        resolve(out);
      });
    });
  }

  private subtree(rootOid: string): Promise<Array<{ index: number; value: unknown }>> {
    return new Promise((resolve, reject) => {
      const collected: Array<{ index: number; value: unknown }> = [];
      this.session.subtree(
        rootOid,
        20,
        (varbinds: snmp.Varbind[]) => {
          for (const vb of varbinds) {
            if (snmp.isVarbindError(vb)) continue;
            const idxStr = vb.oid.slice(rootOid.length + 1);
            const index = Number.parseInt(idxStr.split('.')[0] ?? '0', 10);
            if (Number.isFinite(index) && index > 0) {
              collected.push({ index, value: vb.value });
            }
          }
        },
        (err: Error | null) => {
          if (err) return reject(err);
          resolve(collected);
        },
      );
    });
  }
}

/** Auto-pick WAN interfaces from a list. Heuristic: physical-named (eth\d+),
 *  operationally up, with a real link speed (>= 1Gbps). UDM Pro Max defaults
 *  to eth9/eth10 (the SFP+ ports). */
export function autoDetectWanInterfaces(ifs: SnmpInterface[]): SnmpInterface[] {
  const candidates = ifs.filter(
    (i) =>
      i.ifOperStatus === 1 &&
      i.ifHighSpeedMbps >= 1000 &&
      // ifName for SFP+ on UDM contains the eth\d+ at the end of the descriptor
      /\beth\d+$/.test(i.ifName),
  );
  // Sort by speed desc, then by ifIndex asc — picks fastest interfaces first.
  candidates.sort((a, b) => b.ifHighSpeedMbps - a.ifHighSpeedMbps || a.ifIndex - b.ifIndex);
  // Prefer the SFP+ 10G ports (eth9/eth10) when present.
  const sfpFirst = candidates.filter((c) => /\beth(9|10)$/.test(c.ifName));
  if (sfpFirst.length >= 1) return sfpFirst.slice(0, 2);
  return candidates.slice(0, 2);
}
