import * as snmp from 'net-snmp';

const OID_IF_DESCR = '1.3.6.1.2.1.2.2.1.2';
const OID_IF_OPER_STATUS = '1.3.6.1.2.1.2.2.1.8';
const OID_IF_PHYS_ADDR = '1.3.6.1.2.1.2.2.1.6';
// ifName (1.3.6.1.2.1.31.1.1.1.1) is the kernel-level interface name
// (`eth12`, `br0`). Distinct from ifDescr (1.3.6.1.2.1.2.2.1.2), which on
// the cn10k UniFi gateway reports useless strings like "Cavium, Inc.
// Device a063" for some ports — we walk ifName and only fall back to
// ifDescr if a row has no ifName entry.
const OID_IF_NAME = '1.3.6.1.2.1.31.1.1.1.1';
const OID_IF_HC_IN_OCTETS = '1.3.6.1.2.1.31.1.1.1.6';
const OID_IF_HC_OUT_OCTETS = '1.3.6.1.2.1.31.1.1.1.10';
const OID_IF_HIGH_SPEED = '1.3.6.1.2.1.31.1.1.1.15';
const OID_IF_ALIAS = '1.3.6.1.2.1.31.1.1.1.18';
const OID_IP_AD_ENT_IF_INDEX = '1.3.6.1.2.1.4.20.1.2';

export type SnmpInterface = {
  ifIndex: number;
  ifName: string;
  ifAlias: string;
  ifPhysAddr: string;
  ifOperStatus: number; // 1 = up
  ifHighSpeedMbps: number;
  ipv4Addrs: string[];
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

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString();
  return value == null ? '' : String(value);
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

  /** Walk the interface table and return summary info for every interface.
   *  Walks run sequentially: the UDM SNMP agent has been observed to return
   *  genErr when hit with five concurrent subtree requests at boot. */
  async listInterfaces(): Promise<SnmpInterface[]> {
    const names = await this.subtree(OID_IF_NAME);
    const descrs = await this.subtree(OID_IF_DESCR);
    const aliases = await this.subtree(OID_IF_ALIAS);
    const opers = await this.subtree(OID_IF_OPER_STATUS);
    const speeds = await this.subtree(OID_IF_HIGH_SPEED);
    const addrs = await this.subtree(OID_IF_PHYS_ADDR);
    const ipsByIf = await this.listIpv4ByIfIndex();
    const ifIndexes = new Set<number>();
    for (const d of names) ifIndexes.add(d.index);
    for (const d of descrs) ifIndexes.add(d.index);
    const out: SnmpInterface[] = [];
    for (const idx of ifIndexes) {
      const name = names.find((x) => x.index === idx)?.value;
      const descr = descrs.find((x) => x.index === idx)?.value;
      const alias = aliases.find((x) => x.index === idx)?.value;
      const oper = opers.find((x) => x.index === idx)?.value;
      const speed = speeds.find((x) => x.index === idx)?.value;
      const addr = addrs.find((x) => x.index === idx)?.value;
      const ifName = stringify(name) || stringify(descr);
      out.push({
        ifIndex: idx,
        ifName,
        ifAlias: stringify(alias),
        ifPhysAddr: macFromBuf(addr),
        ifOperStatus: typeof oper === 'number' ? oper : 0,
        ifHighSpeedMbps: typeof speed === 'number' ? speed : 0,
        ipv4Addrs: ipsByIf.get(idx) ?? [],
      });
    }
    return out.sort((a, b) => a.ifIndex - b.ifIndex);
  }

  /** Walk the IP address table and return a map of ifIndex → assigned IPv4
   *  addresses. The OID suffix after the root encodes the IPv4 address
   *  (A.B.C.D); the value is the ifIndex. Used to identify WAN interfaces
   *  by the presence of a non-RFC1918 address. */
  async listIpv4ByIfIndex(): Promise<Map<number, string[]>> {
    const out = new Map<number, string[]>();
    await new Promise<void>((resolve, reject) => {
      this.session.subtree(
        OID_IP_AD_ENT_IF_INDEX,
        20,
        (varbinds: snmp.Varbind[]) => {
          for (const vb of varbinds) {
            if (snmp.isVarbindError(vb)) continue;
            const suffix = vb.oid.slice(OID_IP_AD_ENT_IF_INDEX.length + 1);
            const octets = suffix.split('.').map((s) => Number.parseInt(s, 10));
            if (octets.length !== 4 || octets.some((o) => !Number.isFinite(o))) continue;
            const ip = octets.join('.');
            const ifIndex = typeof vb.value === 'number' ? vb.value : Number(vb.value);
            if (!Number.isFinite(ifIndex) || ifIndex <= 0) continue;
            const arr = out.get(ifIndex) ?? [];
            arr.push(ip);
            out.set(ifIndex, arr);
          }
        },
        (err: Error | null) => (err ? reject(err) : resolve()),
      );
    });
    return out;
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

/** RFC1918 / link-local / loopback / multicast — anything that can't be a
 *  WAN-side IP. CGNAT (100.64/10) is *not* excluded; some ISPs hand out
 *  CGNAT addresses on real WAN uplinks. */
function isRoutableExternalIp(ip: string): boolean {
  const o = ip.split('.').map(Number);
  if (o.length !== 4 || o.some((x) => !Number.isFinite(x) || x < 0 || x > 255)) return false;
  const a = o[0] ?? 0;
  const b = o[1] ?? 0;
  if (a === 10) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 0) return false;
  if (a >= 224) return false;
  return true;
}

/** Self-healing WAN auto-detect.
 *
 *  Strategy, in priority order:
 *   1. Interfaces that hold a routable (non-RFC1918) IPv4 address — this is
 *      the structural definition of a WAN uplink and survives any port
 *      re-cable. Picks `eth\d+` physical interfaces only (not bridges or
 *      VLAN sub-interfaces).
 *   2. If nothing above matches (CGNAT-only WAN with no controller, or SNMP
 *      ipAdEntIfIndex returned empty): fall back to the speed-based
 *      heuristic — operationally-up `eth\d+` interfaces, fastest first,
 *      preferring the UDM Pro Max's eth9/eth10 SFP+ ports.
 *
 *  Caller can override this entirely by setting `UDM_WAN_IFINDEXES` in env,
 *  or by passing controller-derived ifNames via `resolveWanInterfaces`. */
export function autoDetectWanInterfaces(ifs: SnmpInterface[]): SnmpInterface[] {
  const physicalUp = ifs.filter((i) => i.ifOperStatus === 1 && /^eth\d+$/.test(i.ifName));
  const withPublicIp = physicalUp.filter((i) => i.ipv4Addrs.some(isRoutableExternalIp));
  if (withPublicIp.length > 0) {
    withPublicIp.sort((a, b) => a.ifIndex - b.ifIndex);
    return withPublicIp.slice(0, 2);
  }
  const candidates = physicalUp.filter((i) => i.ifHighSpeedMbps >= 1000);
  candidates.sort((a, b) => b.ifHighSpeedMbps - a.ifHighSpeedMbps || a.ifIndex - b.ifIndex);
  const sfpFirst = candidates.filter((c) => /\beth(9|10)$/.test(c.ifName));
  if (sfpFirst.length >= 1) return sfpFirst.slice(0, 2);
  return candidates.slice(0, 2);
}

/** Resolve WAN ifNames (as reported by the UniFi controller's wan1/wan2
 *  designation) to SNMP interfaces. Returns the matched interfaces in the
 *  order the ifNames were given. Drops names that don't map to an up
 *  interface — caller should fall back to `autoDetectWanInterfaces` if the
 *  result is shorter than expected. */
export function resolveWanInterfaces(ifs: SnmpInterface[], ifNames: string[]): SnmpInterface[] {
  const byName = new Map(ifs.map((i) => [i.ifName, i]));
  const out: SnmpInterface[] = [];
  for (const name of ifNames) {
    const m = byName.get(name);
    if (m && m.ifOperStatus === 1) out.push(m);
  }
  return out;
}
