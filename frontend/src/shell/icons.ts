// Manifest icons arrive as names on the wire, because firmware cannot ship a
// component and the two shells resolve names against their own lucide versions.
// Strux is on lucide ^0.577 and the relay on ^1.42, so a name valid on one may not
// exist on the other.
//
// So this MUST NOT throw and MUST NOT return undefined. A missing icon is cosmetic;
// an exception here takes out the whole sidebar, which is the failure the contract
// explicitly forbids.
//
// ── Why a curated set rather than all of lucide ───────────────────────────────
// `import { icons } from "lucide-react"` works and costs 491 KB — it defeats tree
// shaking and pulls all ~1500 icons, which was measured: the shell bundle went from
// 416 KB to 907 KB. `lucide-react/dynamicIconImports` avoids that but emits one
// chunk per icon, and ~1500 files is not something to put in a FAT image on flash.
//
// A named import of a bounded set tree-shakes properly and keeps both costs at zero.
// Unknown names fall back, which the contract already requires, so the failure mode
// is one the design accounts for. A fork that wants another icon adds two lines.

import {
  ActivityIcon,
  BatteryIcon,
  BellIcon,
  CameraIcon,
  ClockIcon,
  CpuIcon,
  DownloadIcon,
  DropletIcon,
  FanIcon,
  GaugeIcon,
  HardDriveIcon,
  HomeIcon,
  LightbulbIcon,
  LockIcon,
  MoonIcon,
  PlugIcon,
  PowerIcon,
  PuzzleIcon,
  RadioIcon,
  SettingsIcon,
  SignalIcon,
  SlidersHorizontalIcon,
  SunIcon,
  TerminalIcon,
  ThermometerIcon,
  ToggleLeftIcon,
  Volume2Icon,
  WavesIcon,
  WifiIcon,
  WindIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react"

// Keyed by the kebab-case names lucide's own site and docs use, which is what a
// manifest will be written with.
const TABLE: Record<string, LucideIcon> = {
  activity: ActivityIcon,
  battery: BatteryIcon,
  bell: BellIcon,
  camera: CameraIcon,
  clock: ClockIcon,
  cpu: CpuIcon,
  download: DownloadIcon,
  droplet: DropletIcon,
  fan: FanIcon,
  gauge: GaugeIcon,
  "hard-drive": HardDriveIcon,
  home: HomeIcon,
  lightbulb: LightbulbIcon,
  lock: LockIcon,
  moon: MoonIcon,
  plug: PlugIcon,
  power: PowerIcon,
  puzzle: PuzzleIcon,
  radio: RadioIcon,
  settings: SettingsIcon,
  signal: SignalIcon,
  "sliders-horizontal": SlidersHorizontalIcon,
  sun: SunIcon,
  terminal: TerminalIcon,
  thermometer: ThermometerIcon,
  "toggle-left": ToggleLeftIcon,
  "volume-2": Volume2Icon,
  waves: WavesIcon,
  wifi: WifiIcon,
  wind: WindIcon,
  zap: ZapIcon,
}

/// Never throws, never returns undefined. Accepts the kebab-case spelling a manifest
/// will use, and tolerates the PascalCase and "…Icon" spellings so a name copied out
/// of a component import still resolves.
export function resolveIcon(name: string | undefined): LucideIcon {
  if (!name) return PuzzleIcon

  const kebab = name
    .replace(/Icon$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase()

  return TABLE[kebab] ?? TABLE[name.toLowerCase()] ?? PuzzleIcon
}
