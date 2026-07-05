/**
 * ATCHMS 3D Room & Bed Visualizer & Virtual Tour Library
 * Uses Three.js and OrbitControls to create premium interactive experiences.
 */
(function() {
  window.ATCHMS3D = {
    /**
     * Initializes a 3D Room Viewer in the target container.
     */
    init3DRoom: function(container, room, allocations = [], onBedSelect = null, currentSelectedBed = null) {
      if (!container) return;
      container.innerHTML = '';
      container.style.position = 'relative';

      // Load CDN dependencies if not present
      if (typeof THREE === 'undefined') {
        container.innerHTML = '<div style="color:var(--muted);padding:20px;text-align:center;">Loading Three.js...</div>';
        return;
      }

      const width = container.clientWidth || 500;
      const height = container.clientHeight || 350;

      // 1. Scene, Camera, Renderer
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#f0f5f2');

      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
      camera.position.set(6, 6, 8);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.shadowMap.enabled = true;
      container.appendChild(renderer.domElement);

      // 2. Orbit Controls
      let controls;
      if (typeof THREE.OrbitControls !== 'undefined') {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
      } else if (THREE.examples && THREE.examples.controls && THREE.examples.controls.OrbitControls) {
        controls = new THREE.examples.controls.OrbitControls(camera, renderer.domElement);
      } else if (window.OrbitControls) {
        controls = new window.OrbitControls(camera, renderer.domElement);
      } else {
        // Fallback controls if library loading differs
        controls = { update: () => {} };
      }
      if (controls.enableDamping) {
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
      }
      if (controls.maxPolarAngle) {
        controls.maxPolarAngle = Math.PI / 2 - 0.05; // don't go below floor
      }

      // 3. Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
      dirLight.position.set(5, 8, 5);
      dirLight.castShadow = true;
      scene.add(dirLight);

      // 4. Room Floor and Walls
      const floorGeo = new THREE.BoxGeometry(7, 0.2, 7);
      const floorMat = new THREE.MeshStandardMaterial({ color: '#d2b48c', roughness: 0.8 }); // wood color
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.position.y = -0.1;
      floor.receiveShadow = true;
      scene.add(floor);

      // Back Wall
      const wallMat = new THREE.MeshStandardMaterial({ color: '#eef2f0', roughness: 0.9 });
      const backWallGeo = new THREE.BoxGeometry(7, 4, 0.2);
      const backWall = new THREE.Mesh(backWallGeo, wallMat);
      backWall.position.set(0, 2, -3.5);
      scene.add(backWall);

      // Left Wall
      const leftWallGeo = new THREE.BoxGeometry(0.2, 4, 7);
      const leftWall = new THREE.Mesh(leftWallGeo, wallMat);
      leftWall.position.set(-3.5, 2, 0);
      scene.add(leftWall);

      // Door (represented on left wall)
      const doorGeo = new THREE.BoxGeometry(0.05, 2.5, 1.2);
      const doorMat = new THREE.MeshStandardMaterial({ color: '#8b5a2b' });
      const door = new THREE.Mesh(doorGeo, doorMat);
      door.position.set(-3.4, 1.25, 2.2);
      scene.add(door);

      // Window (represented on back wall)
      const windowGeo = new THREE.BoxGeometry(2.5, 1.5, 0.05);
      const windowMat = new THREE.MeshStandardMaterial({ color: '#87ceeb', transparent: true, opacity: 0.5 });
      const win = new THREE.Mesh(windowGeo, windowMat);
      win.position.set(0, 2.2, -3.45);
      scene.add(win);

      // Window frame
      const frameGeo = new THREE.BoxGeometry(2.6, 1.6, 0.1);
      const frameMat = new THREE.MeshStandardMaterial({ color: '#555555' });
      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.set(0, 2.2, -3.48);
      scene.add(frame);

      // 5. Add Assets (either from custom layout or default fallback)
      const bedObjects = [];
      let layout = null;
      if (room.layout_json) {
        try {
          layout = typeof room.layout_json === 'string' ? JSON.parse(room.layout_json) : room.layout_json;
        } catch (e) {
          console.error("Failed parsing layout_json", e);
        }
      }

      if (layout && layout.assets && layout.assets.length > 0) {
        const woodMat = new THREE.MeshStandardMaterial({ color: '#5c4033', roughness: 0.9 });
        const metalMat = new THREE.MeshStandardMaterial({ color: '#475569', metalness: 0.8, roughness: 0.2 });

        layout.assets.forEach(asset => {
          const x3d = (asset.x - 300) / 100;
          const z3d = (asset.y - 200) / 100;
          const angleRad = -(asset.angle * Math.PI) / 180;

          const meshGroup = new THREE.Group();
          meshGroup.position.set(x3d, 0, z3d);
          meshGroup.rotation.y = angleRad;

          if (asset.type === 'single_bed') {
            const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.9), woodMat);
            frame.position.y = 0.075;
            meshGroup.add(frame);
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.05), woodMat);
            head.position.set(0, 0.2, -0.425);
            meshGroup.add(head);
            
            const allocation = allocations.find(a => a.bed_label === asset.label);
            let color = '#34d399'; // vacant
            if (allocation) {
              color = '#f87171'; // occupied
            } else if (currentSelectedBed === asset.label) {
              color = '#fef08a'; // selected
            }
            const sheetMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 });
            const mattress = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.84), sheetMat);
            mattress.position.set(0, 0.2, 0.01);
            meshGroup.add(mattress);
            const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.04, 0.18), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
            pillow.position.set(0, 0.27, -0.3);
            meshGroup.add(pillow);

            meshGroup.userData = { label: asset.label, allocation: allocation };
            bedObjects.push(mattress);
          }
          else if (asset.type === 'bunk_bed') {
            const postGeo = new THREE.BoxGeometry(0.04, 1.6, 0.04);
            for (let px of [-0.23, 0.23]) {
              for (let pz of [-0.43, 0.43]) {
                const post = new THREE.Mesh(postGeo, woodMat);
                post.position.set(px, 0.8, pz);
                meshGroup.add(post);
              }
            }
            const lowerFrame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.9), woodMat);
            lowerFrame.position.y = 0.15;
            meshGroup.add(lowerFrame);
            const upperFrame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.9), woodMat);
            upperFrame.position.y = 1.15;
            meshGroup.add(upperFrame);

            const allocation = allocations.find(a => a.bed_label === asset.label);
            let color = '#34d399';
            if (allocation) {
              color = '#f87171';
            } else if (currentSelectedBed === asset.label) {
              color = '#fef08a';
            }
            const lowerSheetMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 });
            const lowerMattress = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.1, 0.84), lowerSheetMat);
            lowerMattress.position.set(0, 0.22, 0);
            meshGroup.add(lowerMattress);
            
            const upperMattress = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.1, 0.84), new THREE.MeshStandardMaterial({ color: '#a78bfa', roughness: 0.7 }));
            upperMattress.position.set(0, 1.22, 0);
            meshGroup.add(upperMattress);

            const pillowMat = new THREE.MeshStandardMaterial({ color: '#ffffff' });
            const pillowLower = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.04, 0.18), pillowMat);
            pillowLower.position.set(0, 0.28, -0.3);
            meshGroup.add(pillowLower);
            const pillowUpper = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.04, 0.18), pillowMat);
            pillowUpper.position.set(0, 1.28, -0.3);
            meshGroup.add(pillowUpper);
            
            const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.2, 0.12), woodMat);
            ladder.position.set(0.24, 0.6, 0.2);
            meshGroup.add(ladder);

            meshGroup.userData = { label: asset.label, allocation: allocation };
            bedObjects.push(lowerMattress);
          }
          else if (asset.type === 'table') {
            const top = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.03, 0.35), woodMat);
            top.position.y = 0.585;
            meshGroup.add(top);
            const legGeo = new THREE.BoxGeometry(0.03, 0.57, 0.03);
            for (let lx of [-0.2, 0.2]) {
              for (let lz of [-0.15, 0.15]) {
                const leg = new THREE.Mesh(legGeo, woodMat);
                leg.position.set(lx, 0.285, lz);
                meshGroup.add(leg);
              }
            }
          }
          else if (asset.type === 'chair') {
            const legGeo = new THREE.BoxGeometry(0.025, 0.34, 0.025);
            for (let lx of [-0.11, 0.11]) {
              for (let lz of [-0.11, 0.11]) {
                const leg = new THREE.Mesh(legGeo, woodMat);
                leg.position.set(lx, 0.17, lz);
                meshGroup.add(leg);
              }
            }
            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.02, 0.25), woodMat);
            seat.position.y = 0.35;
            meshGroup.add(seat);
            const backPostGeo = new THREE.BoxGeometry(0.02, 0.32, 0.02);
            for (let lx of [-0.11, 0.11]) {
              const bp = new THREE.Mesh(backPostGeo, woodMat);
              bp.position.set(lx, 0.51, -0.11);
              meshGroup.add(bp);
            }
            const back = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.02), woodMat);
            back.position.set(0, 0.58, -0.11);
            meshGroup.add(back);
          }
          else if (asset.type === 'cupboard') {
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.35), woodMat);
            body.position.y = 0.7;
            meshGroup.add(body);
            const doorLine = new THREE.Mesh(new THREE.BoxGeometry(0.01, 1.36, 0.36), metalMat);
            doorLine.position.set(0, 0.7, 0.01);
            meshGroup.add(doorLine);
            const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.02), metalMat);
            h1.position.set(-0.04, 0.7, 0.185);
            meshGroup.add(h1);
            const h2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.02), metalMat);
            h2.position.set(0.04, 0.7, 0.185);
            meshGroup.add(h2);
          }

          scene.add(meshGroup);
        });

      } else {
        const capacity = room.capacity || 2;
        const positions = [];
        const labels = [];
        if (capacity === 2) {
          positions.push({ x: -1.8, z: -0.2 }, { x: 1.8, z: -0.2 });
          labels.push('Bed A', 'Bed B');
        } else {
          positions.push(
            { x: -1.9, z: -1.8 },
            { x: -1.9, z: 1.5 },
            { x: 1.9, z: -1.8 },
            { x: 1.9, z: 1.5 }
          );
          labels.push('Bed A', 'Bed B', 'Bed C', 'Bed D');
        }

        const tooltip = document.createElement('div');
        tooltip.style.position = 'absolute';
        tooltip.style.background = 'rgba(15, 23, 42, 0.95)';
        tooltip.style.color = '#fff';
        tooltip.style.padding = '8px 12px';
        tooltip.style.borderRadius = '8px';
        tooltip.style.fontSize = '12px';
        tooltip.style.fontFamily = 'Inter, system-ui, sans-serif';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.display = 'none';
        tooltip.style.zIndex = '99';
        tooltip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        container.appendChild(tooltip);

        labels.forEach((label, idx) => {
          const pos = positions[idx];
          const allocation = allocations.find(a => a.bed_label === label);

          const bedGroup = new THREE.Group();
          bedGroup.position.set(pos.x, 0, pos.z);
          bedGroup.userData = { label, allocation };

          const frameGeo = new THREE.BoxGeometry(1.4, 0.4, 2.4);
          const woodMat = new THREE.MeshStandardMaterial({ color: '#5c4033', roughness: 0.9 });
          const frame = new THREE.Mesh(frameGeo, woodMat);
          frame.position.y = 0.2;
          frame.castShadow = true;
          frame.receiveShadow = true;
          bedGroup.add(frame);

          const sheetGeo = new THREE.BoxGeometry(1.3, 0.25, 2.3);
          let color = '#a7f3d0';
          if (allocation) {
            color = '#fecaca';
          } else if (currentSelectedBed === label) {
            color = '#fef08a';
          }
          const sheetMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 });
          const sheet = new THREE.Mesh(sheetGeo, sheetMat);
          sheet.position.y = 0.45;
          sheet.castShadow = true;
          bedGroup.add(sheet);

          const pillowGeo = new THREE.BoxGeometry(1.0, 0.1, 0.5);
          const pillowMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });
          const pillow = new THREE.Mesh(pillowGeo, pillowMat);
          pillow.position.set(0, 0.6, -0.8);
          pillow.castShadow = true;
          bedGroup.add(pillow);

          const deskTop = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.8), woodMat);
          deskTop.position.set(pos.x > 0 ? pos.x - 0.9 : pos.x + 0.9, 0.8, pos.z - 0.4);
          scene.add(deskTop);
          for (let lx of [-0.4, 0.4]) {
            for (let lz of [-0.3, 0.3]) {
              const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8), woodMat);
              leg.position.set((pos.x > 0 ? pos.x - 0.9 : pos.x + 0.9) + lx, 0.4, (pos.z - 0.4) + lz);
              scene.add(leg);
            }
          }

          scene.add(bedGroup);
          bedObjects.push(sheet);
        });
      }

      // 6. Raycasting Interaction
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      function onMouseMove(event) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(bedObjects);

        if (intersects.length > 0) {
          const hoveredBed = intersects[0].object.parent;
          const label = hoveredBed.userData.label;
          const alloc = hoveredBed.userData.allocation;

          document.body.style.cursor = alloc ? 'not-allowed' : 'pointer';

          // Position tooltip
          tooltip.style.left = (event.clientX - rect.left + 15) + 'px';
          tooltip.style.top = (event.clientY - rect.top + 15) + 'px';
          tooltip.style.display = 'block';

          if (alloc) {
            tooltip.innerHTML = `
              <div style="font-weight:700;color:#f87171;">🔴 ${label} (Occupied)</div>
              <div style="margin-top:4px;"><strong>Occupant:</strong> ${alloc.fullname}</div>
              <div><strong>Adm Number:</strong> ${alloc.admission_no || 'N/A'}</div>
              <div><strong>Prog:</strong> ${alloc.programme || 'N/A'}</div>
            `;
          } else {
            tooltip.innerHTML = `
              <div style="font-weight:700;color:#4ade80;">🟢 ${label} (Available)</div>
              <div style="margin-top:4px;font-size:11px;color:#cbd5e1;">Click to select this bed.</div>
            `;
          }
        } else {
          document.body.style.cursor = 'default';
          tooltip.style.display = 'none';
        }
      }

      function onClick(event) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(bedObjects);

        if (intersects.length > 0) {
          const clickedBed = intersects[0].object.parent;
          const label = clickedBed.userData.label;
          const alloc = clickedBed.userData.allocation;

          if (!alloc && onBedSelect) {
            onBedSelect(label);
          }
        }
      }

      renderer.domElement.addEventListener('mousemove', onMouseMove);
      renderer.domElement.addEventListener('click', onClick);

      // Window resize listener
      const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
          const w = entry.contentRect.width || width;
          const h = entry.contentRect.height || height;
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        }
      });
      resizeObserver.observe(container);

      // 7. Animation loop
      let animId;
      function animate() {
        animId = requestAnimationFrame(animate);
        if (controls) controls.update();
        renderer.render(scene, camera);
      }
      animate();

      return {
        destroy: function() {
          cancelAnimationFrame(animId);
          resizeObserver.disconnect();
          renderer.domElement.removeEventListener('mousemove', onMouseMove);
          renderer.domElement.removeEventListener('click', onClick);
          renderer.dispose();
          if (container.contains(renderer.domElement)) {
            container.removeChild(renderer.domElement);
          }
        }
      };
    },

    /**
     * Initializes a Simulated/Dynamic 360-Degree Panorama Virtual Tour in the target container.
     */
    initVirtualTour: function(container, photoUrl = null) {
      if (!container) return;
      container.innerHTML = '';
      container.style.position = 'relative';

      if (typeof THREE === 'undefined') {
        container.innerHTML = '<div style="color:var(--muted);padding:20px;text-align:center;">Loading Three.js...</div>';
        return;
      }

      const width = container.clientWidth || 600;
      const height = container.clientHeight || 400;

      // Create Scene, Camera, Renderer
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, width / height, 1, 1100);
      camera.target = new THREE.Vector3(0, 0, 0);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(width, height);
      container.appendChild(renderer.domElement);

      // Create Sphere Geometry
      const geometry = new THREE.SphereGeometry(500, 60, 40);
      geometry.scale(-1, 1, 1); // invert the geometry to project texture on the inside

      // Create Dynamic Panoramic Texture Canvas
      const canvas = document.createElement('canvas');
      canvas.width = 2048;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');

      // DRAW MOCK ROOM INTERIOR PANORAMA
      // Sky/Landscape view (seen from windows)
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, '#1e293b');
      grad.addColorStop(0.35, '#3b82f6');
      grad.addColorStop(0.5, '#93c5fd');
      grad.addColorStop(0.51, '#1e3a8a');
      grad.addColorStop(0.7, '#14532d');
      grad.addColorStop(1, '#854d0e');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Room walls & panels
      ctx.fillStyle = '#f8fafc';
      // Render interior walls
      ctx.fillRect(0, 300, 2048, 424);
      // Wood baseboards
      ctx.fillStyle = '#854d0e';
      ctx.fillRect(0, 710, 2048, 14);

      // Floor (Wooden parquet simulation)
      const floorGrad = ctx.createLinearGradient(0, 724, 0, 1024);
      floorGrad.addColorStop(0, '#78350f');
      floorGrad.addColorStop(1, '#451a03');
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, 724, 2048, 300);

      // Draw Floor Planks lines
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 2;
      for (let w = 0; w < 2048; w += 100) {
        ctx.beginPath();
        ctx.moveTo(w, 724);
        ctx.lineTo(w + 120, 1024);
        ctx.stroke();
      }

      // Draw Room features (Beds, Desks, Doors, ATC Logo painting)
      // Left Wall Door
      ctx.fillStyle = '#451a03';
      ctx.fillRect(100, 320, 140, 390); // Door
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(220, 520, 6, 0, Math.PI * 2);
      ctx.fill(); // brass handle

      // ATC Logo frame on Back Wall
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(800, 330, 240, 160); // Painting frame
      ctx.fillStyle = '#065f46';
      ctx.fillRect(810, 340, 220, 140); // canvas
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px Outfit, Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ATC HOSTEL', 920, 410);
      ctx.font = '20px Outfit, Inter, sans-serif';
      ctx.fillStyle = '#facc15';
      ctx.fillText('Virtual 3D Room Tour', 920, 440);

      // Window Frame looking outside
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(1400, 320, 340, 200); // Window exterior frame
      ctx.fillStyle = '#87ceeb';
      ctx.fillRect(1410, 330, 320, 180); // glass pane
      // Draw Window pane details
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(1570, 330);
      ctx.lineTo(1570, 510);
      ctx.moveTo(1410, 420);
      ctx.lineTo(1730, 420);
      ctx.stroke();

      // Beds in 360 panorama
      ctx.fillStyle = '#1e3a8a'; // Blue bed covers
      ctx.fillRect(450, 580, 220, 130);
      ctx.fillStyle = '#ffffff'; // Pillow
      ctx.fillRect(450, 580, 50, 50);

      ctx.fillStyle = '#065f46'; // Green bed covers
      ctx.fillRect(1150, 580, 220, 130);
      ctx.fillStyle = '#ffffff'; // Pillow
      ctx.fillRect(1320, 580, 50, 50);

      // Create Three.js Texture from Canvas
      let texture;
      if (photoUrl && photoUrl !== 'dynamic_virtual_tour_room' && !photoUrl.includes('atc-building.jpg')) {
        // Load custom panorama if provided
        const loader = new THREE.TextureLoader();
        texture = loader.load(photoUrl);
      } else {
        texture = new THREE.CanvasTexture(canvas);
      }

      const material = new THREE.MeshBasicMaterial({ map: texture });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      // Navigation Help Text overlay
      const help = document.createElement('div');
      help.style.position = 'absolute';
      help.style.bottom = '16px';
      help.style.left = '50%';
      help.style.transform = 'translateX(-50%)';
      help.style.background = 'rgba(0,0,0,0.6)';
      help.style.color = '#fff';
      help.style.padding = '8px 16px';
      help.style.borderRadius = '999px';
      help.style.fontSize = '12.5px';
      help.style.pointerEvents = 'none';
      help.style.fontFamily = 'inherit';
      help.innerText = '↕ Drag to rotate view (360° Virtual Tour) ↕';
      container.appendChild(help);

      // Drag interaction variables
      let isUserInteracting = false,
        onPointerDownPointerX = 0, onPointerDownPointerY = 0,
        onPointerDownLon = 0, onPointerDownLat = 0,
        lon = 0, lat = 0,
        phi = 0, theta = 0;

      function onPointerDown(event) {
        isUserInteracting = true;
        onPointerDownPointerX = event.clientX;
        onPointerDownPointerY = event.clientY;
        onPointerDownLon = lon;
        onPointerDownLat = lat;
      }

      function onPointerMove(event) {
        if (isUserInteracting === true) {
          lon = (onPointerDownPointerX - event.clientX) * 0.1 + onPointerDownLon;
          lat = (event.clientY - onPointerDownPointerY) * 0.1 + onPointerDownLat;
        }
      }

      function onPointerUp() {
        isUserInteracting = false;
      }

      function onWheel(event) {
        const fov = camera.fov + event.deltaY * 0.05;
        camera.fov = Math.max(30, Math.min(100, fov));
        camera.updateProjectionMatrix();
      }

      container.addEventListener('pointerdown', onPointerDown);
      document.addEventListener('pointermove', onMouseMoveGlobal);
      document.addEventListener('pointerup', onPointerUpGlobal);
      container.addEventListener('wheel', onWheel);

      function onMouseMoveGlobal(e) {
        onPointerMove(e);
      }
      function onPointerUpGlobal(e) {
        onPointerUp(e);
      }

      // Resize observer
      const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
          const w = entry.contentRect.width || width;
          const h = entry.contentRect.height || height;
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        }
      });
      resizeObserver.observe(container);

      // Animation Render Loop
      let animId;
      function animate() {
        animId = requestAnimationFrame(animate);
        update();
      }

      function update() {
        lat = Math.max(-85, Math.min(85, lat));
        phi = THREE.MathUtils.degToRad(90 - lat);
        theta = THREE.MathUtils.degToRad(lon);

        const x = 500 * Math.sin(phi) * Math.cos(theta);
        const y = 500 * Math.cos(phi);
        const z = 500 * Math.sin(phi) * Math.sin(theta);

        camera.lookAt(x, y, z);
        renderer.render(scene, camera);
      }
      
      animate();

      return {
        destroy: function() {
          cancelAnimationFrame(animId);
          resizeObserver.disconnect();
          container.removeEventListener('pointerdown', onPointerDown);
          document.removeEventListener('pointermove', onMouseMoveGlobal);
          document.removeEventListener('pointerup', onPointerUpGlobal);
          container.removeEventListener('wheel', onWheel);
          renderer.dispose();
          if (container.contains(renderer.domElement)) {
            container.removeChild(renderer.domElement);
          }
        }
      };
    }
  };
})();
