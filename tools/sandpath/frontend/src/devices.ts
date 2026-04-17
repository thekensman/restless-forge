/**
 * Sand table device profiles.
 * Direct TypeScript port of backend/devices.py.
 */

export interface DeviceProfile {
  id: string;
  name: string;
  description: string;
  shape: "circular" | "rectangular";
  width_mm: number;
  height_mm: number;
  /** Circular: max safe rho (0–1). Rectangular: unused (set to 1.0). */
  max_rho: number;
  output_format: "thr" | "gcode";
}

export const DEVICES: Record<string, DeviceProfile> = {
  oasis_mini: {
    id: "oasis_mini",
    name: "Oasis Mini",
    description: 'Grounded Oasis Mini — 6.5" circular',
    shape: "circular",
    width_mm: 165, height_mm: 165, max_rho: 0.95, output_format: "thr",
  },
  oasis_one: {
    id: "oasis_one",
    name: "Oasis One",
    description: 'Grounded Oasis One — 18.5" circular',
    shape: "circular",
    width_mm: 470, height_mm: 470, max_rho: 0.95, output_format: "thr",
  },
  sisyphus_mini: {
    id: "sisyphus_mini",
    name: "Sisyphus Mini",
    description: 'Sisyphus Industries Mini — 15.5" circular',
    shape: "circular",
    width_mm: 394, height_mm: 394, max_rho: 0.95, output_format: "thr",
  },
  sisyphus_coffee: {
    id: "sisyphus_coffee",
    name: "Sisyphus Coffee Table",
    description: 'Sisyphus Industries — 24.5" circular',
    shape: "circular",
    width_mm: 622, height_mm: 622, max_rho: 0.95, output_format: "thr",
  },
  sisyphus_end: {
    id: "sisyphus_end",
    name: "Sisyphus End Table",
    description: 'Sisyphus Industries — 18" circular',
    shape: "circular",
    width_mm: 457, height_mm: 457, max_rho: 0.95, output_format: "thr",
  },
  zen_xy: {
    id: "zen_xy",
    name: "ZenXY (V1E)",
    description: "V1 Engineering ZenXY — rectangular (default 500×350 mm)",
    shape: "rectangular",
    width_mm: 500, height_mm: 350, max_rho: 1.0, output_format: "gcode",
  },
  custom_circular: {
    id: "custom_circular",
    name: "Custom Circular",
    description: "Custom circular polar table",
    shape: "circular",
    width_mm: 300, height_mm: 300, max_rho: 0.95, output_format: "thr",
  },
  custom_rectangular: {
    id: "custom_rectangular",
    name: "Custom Rectangular",
    description: "Custom rectangular Cartesian table",
    shape: "rectangular",
    width_mm: 400, height_mm: 300, max_rho: 1.0, output_format: "gcode",
  },
};

export const DEVICE_LIST: DeviceProfile[] = Object.values(DEVICES);
