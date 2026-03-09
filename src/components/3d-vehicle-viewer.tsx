"use client";

/**
 * 3d-vehicle-viewer.tsx
 *
 * Interactive 3D vehicle model that maps MPI inspection results to
 * colour-coded emissive materials on the car mesh.
 *
 * Requirements (Issue #31):
 *  • Integrates react-three-fiber + @react-three/drei
 *  • Loads a generic low-poly GLTF car model (placeholder URL)
 *  • Maps MPI JSON payload (fluids/tires/brakes/belts) to mesh materials
 *    – FAIL  → glowing red emissive material
 *    – MONITOR → glowing amber emissive material
 *    – PASS  → neutral grey material
 *  • Touch-responsive (pinch-to-zoom, swipe-to-rotate) with clamped angles
 */

import { Suspense, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  useGLTF,
  Html,
  PerspectiveCamera,
} from "@react-three/drei";
import * as THREE from "three";

// ---------------------------------------------------------------------------
// MPI types (mirrored from portal/actions.ts to avoid cross-boundary import)
// ---------------------------------------------------------------------------

export type MpiStatus = "PASS" | "MONITOR" | "FAIL" | null;

export interface MpiData {
  fluids: { status: MpiStatus; note?: string };
  tires: { status: MpiStatus; note?: string };
  brakes: { status: MpiStatus; note?: string };
  belts: { status: MpiStatus; note?: string };
}

// ---------------------------------------------------------------------------
// Status → material colour map
// ---------------------------------------------------------------------------

const STATUS_COLOR: Record<NonNullable<MpiStatus>, THREE.Color> = {
  PASS: new THREE.Color(0x4ade80),     // green-400
  MONITOR: new THREE.Color(0xfbbf24),  // amber-400
  FAIL: new THREE.Color(0xf87171),     // red-400
};

const STATUS_EMISSIVE_INTENSITY: Record<NonNullable<MpiStatus>, number> = {
  PASS: 0.0,
  MONITOR: 0.4,
  FAIL: 0.7,
};

// ---------------------------------------------------------------------------
// Mesh → MPI category mapping
// These mesh name patterns match the placeholder GLTF model.
// Adjust the patterns to match the mesh names of your actual GLTF asset.
// ---------------------------------------------------------------------------

const MESH_MPI_MAP: { patterns: RegExp[]; key: keyof MpiData }[] = [
  { patterns: [/wheel/i, /tire/i, /tyre/i], key: "tires" },
  { patterns: [/brake/i, /caliper/i, /disc/i, /rotor/i], key: "brakes" },
  {
    patterns: [/engine/i, /hood/i, /radiator/i, /coolant/i, /oil/i],
    key: "fluids",
  },
  {
    patterns: [/belt/i, /hose/i, /serpentine/i, /timing/i],
    key: "belts",
  },
];

function resolveMpiKey(meshName: string): keyof MpiData | null {
  for (const { patterns, key } of MESH_MPI_MAP) {
    if (patterns.some((r) => r.test(meshName))) return key;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Car GLTF URL — configurable via environment variable
// In production set NEXT_PUBLIC_3D_MODEL_URL to a bundled asset or CDN path.
// Falls back to a public Three.js demo model in dev / test.
// ---------------------------------------------------------------------------

const GLTF_URL =
  process.env.NEXT_PUBLIC_3D_MODEL_URL ??
  (process.env.NODE_ENV === "production"
    ? "/models/car.glb"
    : "https://threejs.org/examples/models/gltf/ferrari.glb");

// ---------------------------------------------------------------------------
// CarModel — loads GLTF and applies MPI materials
// ---------------------------------------------------------------------------

function CarModel({ mpi }: { mpi: MpiData | null }) {
  const gltf = useGLTF(GLTF_URL);

  // Clone the scene so material mutations don't pollute the cache
  const cloned = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const groupRef = useMemo(() => ({ current: cloned }), [cloned]);

  // Apply MPI-driven emissive materials
  useMemo(() => {
    cloned.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (!mpi) return;

      const key = resolveMpiKey(obj.name);
      if (!key) return;

      const status = mpi[key]?.status;
      if (!status) return;

      const sourceMat = Array.isArray(obj.material)
        ? obj.material[0]
        : obj.material;
      if (!(sourceMat instanceof THREE.MeshStandardMaterial)) return;
      const mat = sourceMat.clone();
      mat.emissive = STATUS_COLOR[status];
      mat.emissiveIntensity = STATUS_EMISSIVE_INTENSITY[status];
      obj.material = mat;
    });
  }, [cloned, mpi]);

  // Gentle auto-rotation when idle (stops when user interacts)
  useFrame(({ clock }) => {
    groupRef.current.rotation.y = clock.getElapsedTime() * 0.15;
  });

  return <primitive object={cloned} scale={0.012} />;
}

// ---------------------------------------------------------------------------
// Loading fallback
// ---------------------------------------------------------------------------

function LoadingFallback() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-2 text-gray-400">
        <span className="text-3xl animate-pulse">🚗</span>
        <span className="text-xs font-medium">Loading 3D model…</span>
      </div>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function MpiLegend({ mpi }: { mpi: MpiData | null }) {
  if (!mpi) return null;

  const items: { label: string; key: keyof MpiData }[] = [
    { label: "Fluids", key: "fluids" },
    { label: "Tires", key: "tires" },
    { label: "Brakes", key: "brakes" },
    { label: "Belts & Hoses", key: "belts" },
  ];

  const dotColor: Record<NonNullable<MpiStatus>, string> = {
    PASS: "bg-green-400",
    MONITOR: "bg-amber-400",
    FAIL: "bg-red-400 animate-pulse",
  };

  return (
    <div className="flex flex-wrap justify-center gap-3 mt-3">
      {items.map(({ label, key }) => {
        const status = mpi[key]?.status;
        return (
          <div key={key} className="flex items-center gap-1.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                status ? dotColor[status] : "bg-gray-600"
              }`}
            />
            <span className="text-xs text-gray-400">{label}</span>
            {status && (
              <span
                className={`text-xs font-semibold ${
                  status === "FAIL"
                    ? "text-red-400"
                    : status === "MONITOR"
                      ? "text-amber-400"
                      : "text-green-400"
                }`}
              >
                {status}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

interface VehicleViewerProps {
  mpi?: MpiData | null;
  /** Container height (Tailwind class). Defaults to h-64. */
  heightClass?: string;
}

export default function VehicleViewer({
  mpi = null,
  heightClass = "h-64",
}: VehicleViewerProps) {
  return (
    <div className="w-full">
      <div className={`${heightClass} w-full rounded-2xl overflow-hidden bg-gray-900 border border-gray-800`}>
        <Canvas
          gl={{ antialias: true }}
          shadows
          dpr={[1, 2]}
        >
          <PerspectiveCamera makeDefault position={[3, 2, 5]} fov={45} />

          {/* Lighting */}
          <ambientLight intensity={0.6} />
          <directionalLight
            position={[5, 10, 5]}
            intensity={1.2}
            castShadow
          />
          <directionalLight position={[-5, 5, -5]} intensity={0.4} />

          {/* Touch-responsive orbit controls with clamped angles */}
          <OrbitControls
            enablePan={false}
            minPolarAngle={Math.PI / 6}      // 30° — can't look from below
            maxPolarAngle={Math.PI / 2.2}    // ~82° — stays above horizon
            minAzimuthAngle={-Math.PI / 2}   // Limit horizontal sweep
            maxAzimuthAngle={Math.PI / 2}
            minDistance={3}
            maxDistance={10}
            enableDamping
            dampingFactor={0.08}
            touches={{
              ONE: THREE.TOUCH.ROTATE,
              TWO: THREE.TOUCH.DOLLY_PAN,
            }}
          />

          <Suspense fallback={<LoadingFallback />}>
            <CarModel mpi={mpi} />
          </Suspense>
        </Canvas>
      </div>

      <MpiLegend mpi={mpi} />
    </div>
  );
}

// Pre-load the model on module import to avoid waterfall
useGLTF.preload(GLTF_URL);
