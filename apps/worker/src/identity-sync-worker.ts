export class CloudIdentitySyncTransport {
  public constructor(private readonly cloudUrl: string, private readonly edgeServerId: string, private readonly edgeServerToken: string, private readonly localApplyUrl: string, private readonly internalSecret: string) {}

  public async synchronize(): Promise<void> {
    const snapshotResponse = await fetch(this.cloudUrl, { headers: { authorization: `Bearer ${this.edgeServerToken}`, "x-edge-server-id": this.edgeServerId } });
    if (!snapshotResponse.ok) throw new Error(`Cloud identity snapshot failed with HTTP ${snapshotResponse.status}`);
    const snapshot: unknown = await snapshotResponse.json();
    const applyResponse = await fetch(this.localApplyUrl, { method: "POST", headers: { "content-type": "application/json", "x-edge-internal-secret": this.internalSecret }, body: JSON.stringify(snapshot) });
    if (!applyResponse.ok) throw new Error(`Local identity apply failed with HTTP ${applyResponse.status}`);
  }
}