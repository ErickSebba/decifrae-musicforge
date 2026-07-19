import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { RhythmStaff } from "./RhythmStaff";

// AlphaTabApi real não roda no jsdom — fake que captura as settings passadas e as
// chamadas de reconfiguração, com os MESMOS valores de enum da versão instalada.
const h = vi.hoisted(() => {
  interface FakeSettings {
    display: { staveProfile: number };
  }
  class FakeAlphaTabApi {
    settings: FakeSettings;
    updateSettings = vi.fn();
    render = vi.fn();
    tex = vi.fn();
    destroy = vi.fn();
    midiLoaded = { on: vi.fn() };
    playerReady = { on: vi.fn() };
    player = null;
    constructor(_el: unknown, settings: FakeSettings) {
      this.settings = settings;
      instances.push(this);
    }
  }
  const instances: InstanceType<typeof FakeAlphaTabApi>[] = [];
  return { FakeAlphaTabApi, instances };
});

vi.mock("@coderline/alphatab", () => ({
  AlphaTabApi: h.FakeAlphaTabApi,
  LogLevel: { Warning: 2 },
  LayoutMode: { Page: 0 },
  // Valores reais do enum na 1.8.3 (alphaTab.d.ts): Default=0, ScoreTab=1, Score=2, Tab=3.
  StaveProfile: { Default: 0, ScoreTab: 1, Score: 2, Tab: 3, TabMixed: 4 },
  PlayerMode: { EnabledExternalMedia: 3 },
  ScrollMode: { Off: 0 },
}));

beforeEach(() => {
  h.instances.length = 0;
});

describe("RhythmStaff — displayMode (2.6)", () => {
  it("sem a prop: StaveProfile.Score — comportamento original (Tap/Ditado intactos)", () => {
    render(<RhythmStaff tex="\\clef F4" />);
    expect(h.instances[0].settings.display.staveProfile).toBe(2);
  });

  it("tab e both mapeiam pra Tab e ScoreTab", () => {
    render(<RhythmStaff tex="x" displayMode="tab" />);
    expect(h.instances[0].settings.display.staveProfile).toBe(3);

    render(<RhythmStaff tex="x" displayMode="both" />);
    expect(h.instances[1].settings.display.staveProfile).toBe(1);
  });

  it("trocar o modo em runtime aplica settings + updateSettings + render", () => {
    const { rerender } = render(<RhythmStaff tex="x" displayMode="score" />);
    const api = h.instances[0];
    expect(api.updateSettings).not.toHaveBeenCalled();

    rerender(<RhythmStaff tex="x" displayMode="tab" />);
    expect(api.settings.display.staveProfile).toBe(3);
    expect(api.updateSettings).toHaveBeenCalledTimes(1);
    expect(api.render).toHaveBeenCalledTimes(1);
  });

  it("re-render com o MESMO modo não reconfigura nada", () => {
    const { rerender } = render(<RhythmStaff tex="x" displayMode="tab" />);
    rerender(<RhythmStaff tex="y" displayMode="tab" />);
    expect(h.instances[0].updateSettings).not.toHaveBeenCalled();
  });
});
