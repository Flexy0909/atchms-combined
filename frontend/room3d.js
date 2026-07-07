/* ATCHMS 3D Room Renderer & Panorama Tour Helper */
(function () {
  window.ATCHMS3D = {
    /**
     * Initializes an Interactive 3D Room Viewer in the target container.
     * Supports custom room layouts, double-decker frames, rose-brown vacant beds, and dynamic floating labels.
     */
    init3DRoom: function(container, room, allocations, onBedSelect, currentSelectedBed) {
      if (!container) return;
      container.innerHTML = '';
      container.style.position = 'relative';

      if (typeof THREE === 'undefined') {
        container.innerHTML = '<div style="color:var(--muted);padding:20px;text-align:center;">Loading Three.js...</div>';
        return;
      }

      const width = container.clientWidth || 400;
      const height = container.clientHeight || 300;

      // 1. Setup Three.js Scene, Camera, Renderer
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#f8f5ee'); // TanStack matching background

      const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
      camera.position.set(7, 6, 9);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.shadowMap.enabled = true;
      container.appendChild(renderer.domElement);

      // Create Tooltip Overlay
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
      tooltip.style.border = '1px solid rgba(255,255,255,0.15)';
      container.appendChild(tooltip);

      // Create Floating 3D Labels Overlay Container
      const labelsOverlay = document.createElement('div');
      labelsOverlay.id = 'room3d-labels-overlay';
      labelsOverlay.style.position = 'absolute';
      labelsOverlay.style.top = '0';
      labelsOverlay.style.left = '0';
      labelsOverlay.style.width = '100%';
      labelsOverlay.style.height = '100%';
      labelsOverlay.style.pointerEvents = 'none';
      labelsOverlay.style.overflow = 'hidden';
      labelsOverlay.style.zIndex = '10';
      container.appendChild(labelsOverlay);

      // 2. Setup OrbitControls
      let controls = null;
      if (typeof THREE.OrbitControls !== 'undefined') {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2 - 0.05; // don't go below floor
        controls.minDistance = 3;
        controls.maxDistance = 25;
      }

      // 3. Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
      dirLight.position.set(5, 8, 5);
      dirLight.castShadow = true;
      scene.add(dirLight);

      // 4. Room Floor and Walls based on dynamic room sizes
      const w = room.width || 6;
      const d = room.depth || 5;
      const h = room.height || 3;

      // Grid helper
      const gridHelper = new THREE.GridHelper(Math.max(w, d), Math.max(w, d) * 2, '#cbd5e1', '#e2e8f0');
      gridHelper.position.y = 0.005;
      scene.add(gridHelper);

      // Floor (light grey matching the React screenshot)
      const floorGeo = new THREE.BoxGeometry(w, 0.1, d);
      const floorMat = new THREE.MeshStandardMaterial({ color: '#cccccc', roughness: 0.8 });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.position.y = -0.05;
      floor.receiveShadow = true;
      scene.add(floor);

      // Walls
      const wallMat = new THREE.MeshStandardMaterial({ color: '#dddddd', roughness: 0.9, side: THREE.DoubleSide });
      const transparentWallMat = new THREE.MeshStandardMaterial({ 
        color: '#dddddd', 
        roughness: 0.9, 
        transparent: true, 
        opacity: 0.15, 
        side: THREE.DoubleSide 
      });
      
      // Back Wall
      const backWall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), wallMat);
      backWall.position.set(0, h/2, -d/2);
      scene.add(backWall);

      // Left Wall
      const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, d), wallMat);
      leftWall.position.set(-w/2, h/2, 0);
      scene.add(leftWall);

      // Front Wall (Transparent)
      const frontWall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), transparentWallMat);
      frontWall.position.set(0, h/2, d/2);
      scene.add(frontWall);

      // Right Wall (Transparent)
      const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, d), transparentWallMat);
      rightWall.position.set(w/2, h/2, 0);
      scene.add(rightWall);

      // 5. Asset Placement Arrays
      const bedObjects = [];
      const labelTrackers = []; // { id, mesh, yOffset, label, isVip }
      let layout = null;

      if (room.layout_json) {
        try {
          layout = typeof room.layout_json === 'string' ? JSON.parse(room.layout_json) : room.layout_json;
        } catch (e) {
          console.error("Failed parsing layout_json", e);
        }
      }

      const woodMat = new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.9 }); // Warm brown cupboard/doors
      const darkFrameMat = new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.5, roughness: 0.5 }); // Dark bunk bed frame
      const lightBlueMat = new THREE.MeshStandardMaterial({ color: '#8ecae6', transparent: true, opacity: 0.7, roughness: 0.1 }); // Windows

      function getBedColor(bedLabel, allocation) {
        if (allocation) return '#6b6b6b'; // Taken/occupied (grey)
        if (currentSelectedBed === bedLabel) return '#4ade80'; // Selected (green)
        return '#c98a7d'; // Vacant (rose-brown sheets)
      }

      // If a custom layout is available, load it
      if (layout && layout.assets && layout.assets.length > 0) {
        layout.assets.forEach(asset => {
          const x3d = (asset.x - 300) / 100;
          const z3d = (asset.y - 200) / 100;
          const angleRad = -(asset.angle * Math.PI) / 180;

          const meshGroup = new THREE.Group();
          meshGroup.position.set(x3d, 0, z3d);
          meshGroup.rotation.y = angleRad;

          if (asset.type === 'single_bed') {
            // Bed frame
            const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 2.0), woodMat);
            frame.position.y = 0.15;
            meshGroup.add(frame);

            // Bed sheet color logic
            const allocation = allocations.find(a => a.bed_label === asset.label);
            const color = getBedColor(asset.label, allocation);
            
            const sheetMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 });
            const mattress = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.2, 1.9), sheetMat);
            mattress.position.set(0, 0.3, 0);
            meshGroup.add(mattress);

            mattress.userData = { isBed: true, label: asset.label, allocation: allocation };
            bedObjects.push(mattress);

            // Add to Label trackers
            labelTrackers.push({
              mesh: mattress,
              yOffset: 0.45,
              label: asset.label,
              isVip: asset.vip
            });
          }
          else if (asset.type === 'bunk_bed') {
            // Four dark posts
            const postGeo = new THREE.BoxGeometry(0.08, 1.8, 0.08);
            for (let px of [-0.46, 0.46]) {
              for (let pz of [-0.96, 0.96]) {
                const post = new THREE.Mesh(postGeo, darkFrameMat);
                post.position.set(px, 0.9, pz);
                meshGroup.add(post);
              }
            }
            
            // Upper & Lower frames
            const lowerFrame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 2.0), darkFrameMat);
            lowerFrame.position.y = 0.15;
            meshGroup.add(lowerFrame);
            
            const upperFrame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 2.0), darkFrameMat);
            upperFrame.position.y = 1.05;
            meshGroup.add(upperFrame);

            // Split the labels (e.g. "Bunk A/B")
            const parts = asset.label.split('/');
            const lowerLabel = parts[0] ? parts[0].trim() : (asset.label + ' Lower');
            const upperLabel = parts[1] ? parts[1].trim() : (asset.label + ' Upper');

            // Lower Mattress
            const lowerAllocation = allocations.find(a => a.bed_label === lowerLabel);
            const lowerColor = getBedColor(lowerLabel, lowerAllocation);
            const lowerSheetMat = new THREE.MeshStandardMaterial({ color: lowerColor, roughness: 0.7 });
            const lowerMattress = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.18, 1.9), lowerSheetMat);
            lowerMattress.position.set(0, 0.25, 0);
            meshGroup.add(lowerMattress);

            lowerMattress.userData = { isBed: true, label: lowerLabel, allocation: lowerAllocation };
            bedObjects.push(lowerMattress);

            // Upper Mattress
            const upperAllocation = allocations.find(a => a.bed_label === upperLabel);
            const upperColor = getBedColor(upperLabel, upperAllocation);
            const upperSheetMat = new THREE.MeshStandardMaterial({ color: upperColor, roughness: 0.7 });
            const upperMattress = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.18, 1.9), upperSheetMat);
            upperMattress.position.set(0, 1.15, 0);
            meshGroup.add(upperMattress);

            upperMattress.userData = { isBed: true, label: upperLabel, allocation: upperAllocation };
            bedObjects.push(upperMattress);

            // Add both to labels tracker
            labelTrackers.push(
              { mesh: lowerMattress, yOffset: 0.45, label: lowerLabel, isVip: asset.vip },
              { mesh: upperMattress, yOffset: 1.35, label: upperLabel, isVip: asset.vip }
            );
          }
          else if (asset.type === 'table') {
            const top = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.7), woodMat);
            top.position.y = 0.77;
            meshGroup.add(top);
            const legGeo = new THREE.BoxGeometry(0.06, 0.74, 0.06);
            for (let lx of [-0.44, 0.44]) {
              for (let lz of [-0.29, 0.29]) {
                const leg = new THREE.Mesh(legGeo, woodMat);
                leg.position.set(lx, 0.37, lz);
                meshGroup.add(leg);
              }
            }
          }
          else if (asset.type === 'chair') {
            const legGeo = new THREE.BoxGeometry(0.05, 0.44, 0.05);
            for (let lx of [-0.18, 0.18]) {
              for (let lz of [-0.18, 0.18]) {
                const leg = new THREE.Mesh(legGeo, woodMat);
                leg.position.set(lx, 0.22, lz);
                meshGroup.add(leg);
              }
            }
            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), woodMat);
            seat.position.y = 0.46;
            group.add(seat);
            
            const backPostGeo = new THREE.BoxGeometry(0.04, 0.46, 0.04);
            for (let lx of [-0.18, 0.18]) {
              const bp = new THREE.Mesh(backPostGeo, woodMat);
              bp.position.set(lx, 0.69, -0.18);
              meshGroup.add(bp);
            }
            const back = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.2, 0.04), woodMat);
            back.position.set(0, 0.8, -0.18);
            meshGroup.add(back);
          }
          else if (asset.type === 'cupboard') {
            const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, 0.6), woodMat);
            body.position.y = 1.0;
            meshGroup.add(body);
          }
          else if (asset.type === 'window') {
            const winMesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 0.1), lightBlueMat);
            winMesh.position.y = 1.4;
            meshGroup.add(winMesh);
          }
          else if (asset.type === 'door') {
            const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.1, 0.08), new THREE.MeshStandardMaterial({ color: '#a0522d', roughness: 0.9 }));
            doorMesh.position.y = 1.05;
            meshGroup.add(doorMesh);
          }

          meshGroup.traverse(child => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          scene.add(meshGroup);
        });

      } else {
        // FALLBACK TEMPLATE: Generate default layout template based on capacity
        const capacity = room.capacity || 2;
        const positions = [];
        const labels = [];
        const isBunk = capacity > 2;

        if (capacity === 2) {
          positions.push({ x: -1.6, z: 0 }, { x: 1.6, z: 0 });
          labels.push('Bed A', 'Bed B');
        } else if (capacity === 4) {
          positions.push({ x: -1.6, z: 0 }, { x: 1.6, z: 0 });
          labels.push('Bunk A/B', 'Bunk C/D');
        } else {
          positions.push({ x: -1.6, z: -1.2 }, { x: -1.6, z: 1.2 }, { x: 1.6, z: 0 });
          labels.push('Bunk A/B', 'Bunk C/D', 'Bunk E/F');
        }

        positions.forEach((pos, idx) => {
          const rawLabel = labels[idx];
          const meshGroup = new THREE.Group();
          meshGroup.position.set(pos.x, 0, pos.z);
          meshGroup.rotation.y = pos.x < 0 ? Math.PI / 2 : -Math.PI / 2;

          if (!isBunk) {
            // Fallback Single Bed
            const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 2.0), woodMat);
            frame.position.y = 0.15;
            meshGroup.add(frame);

            const allocation = allocations.find(a => a.bed_label === rawLabel);
            const color = getBedColor(rawLabel, allocation);
            const sheetMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 });
            const mattress = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.2, 1.9), sheetMat);
            mattress.position.set(0, 0.3, 0);
            meshGroup.add(mattress);

            mattress.userData = { isBed: true, label: rawLabel, allocation: allocation };
            bedObjects.push(mattress);

            labelTrackers.push({
              mesh: mattress,
              yOffset: 0.45,
              label: rawLabel,
              isVip: false
            });
          } else {
            // Fallback Bunk Bed
            const postGeo = new THREE.BoxGeometry(0.08, 1.8, 0.08);
            for (let px of [-0.46, 0.46]) {
              for (let pz of [-0.96, 0.96]) {
                const post = new THREE.Mesh(postGeo, darkFrameMat);
                post.position.set(px, 0.9, pz);
                meshGroup.add(post);
              }
            }
            
            const lowerFrame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 2.0), darkFrameMat);
            lowerFrame.position.y = 0.15;
            meshGroup.add(lowerFrame);
            
            const upperFrame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 2.0), darkFrameMat);
            upperFrame.position.y = 1.05;
            meshGroup.add(upperFrame);

            const parts = rawLabel.split('/');
            const lowerLabel = parts[0] ? parts[0].trim() : 'Bed A';
            const upperLabel = parts[1] ? parts[1].trim() : 'Bed B';

            // Lower
            const lowerAllocation = allocations.find(a => a.bed_label === lowerLabel);
            const lowerColor = getBedColor(lowerLabel, lowerAllocation);
            const lowerMattress = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.18, 1.9), new THREE.MeshStandardMaterial({ color: lowerColor, roughness: 0.7 }));
            lowerMattress.position.set(0, 0.25, 0);
            meshGroup.add(lowerMattress);
            lowerMattress.userData = { isBed: true, label: lowerLabel, allocation: lowerAllocation };
            bedObjects.push(lowerMattress);

            // Upper
            const upperAllocation = allocations.find(a => a.bed_label === upperLabel);
            const upperColor = getBedColor(upperLabel, upperAllocation);
            const upperMattress = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.18, 1.9), new THREE.MeshStandardMaterial({ color: upperColor, roughness: 0.7 }));
            upperMattress.position.set(0, 1.15, 0);
            meshGroup.add(upperMattress);
            upperMattress.userData = { isBed: true, label: upperLabel, allocation: upperAllocation };
            bedObjects.push(upperMattress);

            labelTrackers.push(
              { mesh: lowerMattress, yOffset: 0.45, label: lowerLabel, isVip: false },
              { mesh: upperMattress, yOffset: 1.35, label: upperLabel, isVip: false }
            );
          }

          meshGroup.traverse(child => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          scene.add(meshGroup);
        });

        // Spawn a default wardrobe/cupboard
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, 0.6), woodMat);
        body.position.set(0, 1.0, -d/2 + 0.35);
        scene.add(body);
      }

      // Rebuild HTML Label elements
      rebuildFloatingLabelsDOM();

      function rebuildFloatingLabelsDOM() {
        labelsOverlay.innerHTML = '';
        labelTrackers.forEach((t, idx) => {
          const div = document.createElement('div');
          div.id = `room3d-label-${idx}`;
          div.className = 'room3d-floating-label';
          
          // CSS style matching the React screenshot (rounded black bubble)
          div.style.position = 'absolute';
          div.style.transform = 'translate(-50%, -50%)';
          div.style.background = 'rgba(15, 23, 42, 0.95)';
          div.style.color = '#ffffff';
          div.style.padding = '3px 7px';
          div.style.borderRadius = '4px';
          div.style.fontSize = '9.5px';
          div.style.fontWeight = '700';
          div.style.fontFamily = 'Inter, system-ui, sans-serif';
          div.style.whiteSpace = 'nowrap';
          div.style.boxShadow = '0 2px 4px rgba(0,0,0,0.15)';
          div.style.border = t.isVip ? '1px solid #fbbf24' : '1px solid rgba(255,255,255,0.1)';
          div.style.pointerEvents = 'auto';
          div.style.cursor = t.mesh.userData.allocation ? 'not-allowed' : 'pointer';
          
          let text = t.label;
          if (t.mesh.userData.allocation) {
            text += ' • taken';
            div.style.opacity = '0.7';
          }
          div.textContent = text;

          div.addEventListener('click', () => {
            if (!t.mesh.userData.allocation && onBedSelect) {
              onBedSelect(t.label);
            }
          });

          labelsOverlay.appendChild(div);
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
          const hoveredBed = intersects[0].object;
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
          const clickedBed = intersects[0].object;
          const label = clickedBed.userData.label;
          const alloc = clickedBed.userData.allocation;

          if (!alloc && onBedSelect) {
            onBedSelect(label);
          }
        }
      }

      renderer.domElement.addEventListener('mousemove', onMouseMove);
      renderer.domElement.addEventListener('click', onClick);

      // Dynamic projector: Maps 3D coordinates of bed mesh onto the 2D HTML labels overlay
      const tempV = new THREE.Vector3();
      function updateFloatingLabels() {
        const rect = renderer.domElement.getBoundingClientRect();
        labelTrackers.forEach((t, idx) => {
          const div = document.getElementById(`room3d-label-${idx}`);
          if (!div) return;

          tempV.copy(t.mesh.position);
          
          // Get absolute world position by applying parent group matrices
          t.mesh.updateWorldMatrix(true, false);
          tempV.setFromMatrixPosition(t.mesh.matrixWorld);
          
          tempV.y += t.yOffset; // add mattress heights offset
          tempV.project(camera);

          // Don't show labels behind camera
          if (tempV.z > 1) {
            div.style.display = 'none';
            return;
          }

          const x = (tempV.x * .5 + .5) * rect.width;
          const y = (tempV.y * -.5 + .5) * rect.height;

          div.style.display = 'block';
          div.style.left = `${x}px`;
          div.style.top = `${y}px`;
        });
      }

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
        updateFloatingLabels();
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
          if (container.contains(tooltip)) {
            container.removeChild(tooltip);
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

      const width = container.clientWidth || 400;
      const height = container.clientHeight || 300;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, width / height, 1, 1100);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);
      container.appendChild(renderer.domElement);

      const geometry = new THREE.SphereGeometry(500, 60, 40);
      geometry.scale(-1, 1, 1);

      const canvas = document.createElement('canvas');
      canvas.width = 2048;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');

      // Draw high-quality virtual 360 classroom panorama
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, 2048, 1024);

      // Floor (Warm parquet brown)
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, 512, 2048, 512);

      // Wall panel stripes
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 4;
      for (let x = 0; x < 2048; x += 128) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 1024);
        ctx.stroke();
      }

      // Windows
      ctx.fillStyle = '#bfdbfe';
      ctx.fillRect(200, 200, 300, 200);
      ctx.fillRect(800, 200, 300, 200);
      ctx.fillRect(1400, 200, 300, 200);

      // Window frames
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 12;
      ctx.strokeRect(200, 200, 300, 200);
      ctx.strokeRect(800, 200, 300, 200);
      ctx.strokeRect(1400, 200, 300, 200);

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
        const loader = new THREE.TextureLoader();
        texture = loader.load(photoUrl);
      } else {
        texture = new THREE.CanvasTexture(canvas);
      }

      const material = new THREE.MeshBasicMaterial({ map: texture });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

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
