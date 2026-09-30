// Tracks the exact editable snapshot so failed or concurrent edits remain available.
export class SettingsSaveState {
  constructor(read, notify) {
    this.read = read;
    this.notify = notify;
    this.baseline = null;
    this.saving = false;
  }

  loaded() {
    this.baseline = this.read();
    this.notify("unchanged");
  }

  changed() {
    if (!this.saving) this.notify(this.read() === this.baseline ? "unchanged" : "unsaved");
  }

  async save(persist, apply) {
    if (this.saving) return;
    const snapshot = this.read();
    this.saving = true;
    this.notify("saving");
    try {
      const result = await persist();
      if (this.read() === snapshot) {
        apply(result);
        this.baseline = this.read();
        this.notify("saved");
      } else {
        this.baseline = snapshot;
        this.notify("unsaved");
      }
    } catch {
      this.notify("failed");
    } finally {
      this.saving = false;
    }
  }
}
