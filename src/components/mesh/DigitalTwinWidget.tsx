import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { DigitalTwinUI } from '@/api/types';

export const DigitalTwinWidget: React.FC<DigitalTwinUI> = (props) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [selectedElement, setSelectedElement] = useState<{ id: string; temp: number; status: string } | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617); // tailwind slate-950
    const camera = new THREE.PerspectiveCamera(75, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Group for the array
    const arrayGroup = new THREE.Group();
    scene.add(arrayGroup);

    // Map anomalies by element_id
    const anomalyMap = new Map();
    props.anomalies?.forEach(a => anomalyMap.set(a.element_id, a));

    // Generate 8x14 elements (Phased Array)
    const cubes: THREE.Mesh[] = [];
    const rows = 8;
    const cols = 14;
    const spacing = 1.1;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = `TR-${r * cols + c + 1000}`; // Example ID format
        const isAnomaly = anomalyMap.has(id);
        const anomaly = anomalyMap.get(id);

        let color = 0x06b6d4; // cyan-500 (NOMINAL)
        if (isAnomaly) {
          if (anomaly.status === 'CRITICAL_FAILURE') color = 0xef4444; // red-500
          else if (anomaly.status === 'DEGRADED') color = 0xeab308; // yellow-500
        }

        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({ color });
        const cube = new THREE.Mesh(geometry, material);
        
        cube.position.x = (c - cols / 2) * spacing;
        cube.position.y = (r - rows / 2) * spacing;
        cube.userData = { id, temp: isAnomaly ? anomaly.temp : props.core_temp, status: isAnomaly ? anomaly.status : 'NOMINAL' };
        
        arrayGroup.add(cube);
        cubes.push(cube);
      }
    }

    // Camera position
    camera.position.z = 15;

    // Raycaster for click events
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(arrayGroup.children);

      if (intersects.length > 0) {
        const object = intersects[0].object;
        setSelectedElement(object.userData as any);
      } else {
        setSelectedElement(null);
      }
    };

    renderer.domElement.addEventListener('click', onClick);

    // Animation loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      arrayGroup.rotation.x += 0.005;
      arrayGroup.rotation.y += 0.005;
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('click', onClick);
      cancelAnimationFrame(animationFrameId);
      if (mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [props.anomalies, props.core_temp]);

  return (
    <div className="relative w-full h-[500px] rounded-xl overflow-hidden border border-white/10 bg-slate-950">
      {/* 3D Canvas Container */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* HUD Overlay: Top-Left */}
      <div className="absolute top-4 left-4 p-4 glass-panel border-cyan-500/30 flex flex-col gap-2 z-10 pointer-events-none">
        <h3 className="font-mono text-sm font-bold text-cyan-400 uppercase tracking-widest">{props.device_id}</h3>
        <div className="flex flex-col gap-1">
          <div className="flex justify-between gap-4">
            <span className="font-mono text-[10px] text-slate-400">CORE TEMP</span>
            <span className="font-mono text-xs text-slate-200">{props.core_temp?.toFixed(1)}°C</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="font-mono text-[10px] text-slate-400">UPTIME</span>
            <span className="font-mono text-xs text-slate-200">{props.uptime_hours} hrs</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="font-mono text-[10px] text-slate-400">ANOMALIES</span>
            <span className="font-mono text-xs text-amber-400">{props.anomalies?.length || 0}</span>
          </div>
        </div>
      </div>

      {/* HUD Overlay: Right-Side (Diagnostic HUD) */}
      {selectedElement && (
        <div className="absolute top-4 right-4 p-4 glass-panel border-white/20 flex flex-col gap-2 z-10 max-w-[200px]">
          <h4 className="font-mono text-xs font-bold text-white uppercase border-b border-white/10 pb-2">Element Diagnostics</h4>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between gap-4">
              <span className="font-mono text-[10px] text-slate-400">ID</span>
              <span className="font-mono text-xs text-cyan-300">{selectedElement.id}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="font-mono text-[10px] text-slate-400">TEMP</span>
              <span className="font-mono text-xs text-slate-200">{selectedElement.temp?.toFixed(1)}°C</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="font-mono text-[10px] text-slate-400">STATUS</span>
              <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                selectedElement.status === 'CRITICAL_FAILURE' ? 'bg-red-500/20 text-red-400' :
                selectedElement.status === 'DEGRADED' ? 'bg-amber-500/20 text-amber-400' :
                'bg-cyan-500/20 text-cyan-400'
              }`}>
                {selectedElement.status}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};