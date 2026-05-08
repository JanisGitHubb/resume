(function() {
    function setup(canvas, stlPath, camZ, initRotY) {
        const w = canvas.parentElement.clientWidth || 300;
        const h = canvas.parentElement.clientHeight || 300;
        const isShowcase = canvas.classList.contains('exp-showcase-canvas');
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, w / h, 1, 5000);
        camera.position.set(0, 0, camZ);
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setClearColor(0x000000, 0);
        renderer.setSize(w, h);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.render(scene, camera);
        canvas.classList.add('ready');
        canvas.style.cursor = 'grab';
        // Lighting: lower ambient so shadows are deeper, multiple directional for edge definition
        scene.add(new THREE.AmbientLight(0xffffff, 0.35));
        const d1 = new THREE.DirectionalLight(0xffffff, 0.9); d1.position.set(2, 3, 2); scene.add(d1);
        const d2 = new THREE.DirectionalLight(0xffffff, 0.3); d2.position.set(-2, -1, -2); scene.add(d2);
        const d3 = new THREE.DirectionalLight(0xffffff, 0.5); d3.position.set(0, 0, -3); scene.add(d3);
        const d4 = new THREE.DirectionalLight(0xffffff, 0.25); d4.position.set(-3, 1, 0); scene.add(d4);
        new THREE.STLLoader().load(stlPath, geo => {
            const mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0x555555, specular: 0xCCCCCC, shininess: 150, flatShading: false }));
            geo.computeBoundingBox();
            const c = new THREE.Vector3(); geo.boundingBox.getCenter(c); geo.translate(-c.x, -c.y, -c.z);
            mesh.rotation.x = Math.PI;
            mesh.rotation.y = initRotY || 0;
            scene.add(mesh);

            let drag = false, prev = { x: 0, y: 0 };
            (function animate() {
                requestAnimationFrame(animate);
                if (!drag) mesh.rotation.y += 0.005;
                renderer.render(scene, camera);
            })();
            canvas.addEventListener('mousedown', () => { drag = true; canvas.style.cursor = 'grabbing'; });
            canvas.addEventListener('mouseup', () => { drag = false; canvas.style.cursor = 'grab'; });
            canvas.addEventListener('mouseleave', () => { drag = false; canvas.style.cursor = 'grab'; });
            canvas.addEventListener('mousemove', e => {
                if (drag) { mesh.rotation.y += (e.offsetX - prev.x) * 0.01; mesh.rotation.x += (e.offsetY - prev.y) * 0.01; }
                prev = { x: e.offsetX, y: e.offsetY };
            });

            if (isShowcase) {
                window.addEventListener('resize', () => {
                    const nw = canvas.parentElement.clientWidth;
                    const nh = canvas.parentElement.clientHeight;
                    camera.aspect = nw / nh;
                    camera.updateProjectionMatrix();
                    renderer.setSize(nw, nh);
                });
            }
        });
    }

    // Explode viewer
    function setupExplode(canvas, casePath, strapPath, camZ) {
        const w = canvas.parentElement.clientWidth || 300;
        const h = canvas.parentElement.clientHeight || 300;
        const isShowcase = canvas.classList.contains('exp-showcase-canvas');
        const scene = new THREE.Scene();
        if (!isShowcase) {
            scene.background = new THREE.Color(0xEDE8E2);
        }
        const camera = new THREE.PerspectiveCamera(45, w / h, 1, 5000);
        camera.position.set(0, 0, camZ);
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: isShowcase });
        if (isShowcase) {
            renderer.setClearColor(0x000000, 0);
        } else {
            renderer.setClearColor(0xEDE8E2, 1);
        }
        renderer.setSize(w, h);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.render(scene, camera);
        canvas.classList.add('ready');

        scene.add(new THREE.AmbientLight(0xffffff, 0.35));
        const d1 = new THREE.DirectionalLight(0xffffff, 0.9); d1.position.set(2, 3, 2); scene.add(d1);
        const d2 = new THREE.DirectionalLight(0xffffff, 0.3); d2.position.set(-2, -1, -2); scene.add(d2);
        const d3 = new THREE.DirectionalLight(0xffffff, 0.5); d3.position.set(0, 0, -3); scene.add(d3);
        const d4 = new THREE.DirectionalLight(0xffffff, 0.25); d4.position.set(-3, 1, 0); scene.add(d4);

        const pivot = new THREE.Group();
        scene.add(pivot);
        const assembly = new THREE.Group();
        assembly.rotation.z = -Math.PI / 2;
        assembly.rotation.x = Math.PI;
        pivot.add(assembly);

        let caseMesh = null, strapMesh = null;
        let explodeAmount = 0;
        const CONTACT_Z = -10.59;
        const EXPLODE_DIST = 150; // Each part moves 150 units = parts reach edges
        const loader = new THREE.STLLoader();
        let loaded = 0;

        function onBothLoaded() {
            caseMesh.rotation.z = Math.PI;
            strapMesh.position.z = 0;
            caseMesh.position.z = CONTACT_Z;
            const midZ = CONTACT_Z / 2;
            strapMesh.position.z = -midZ;
            caseMesh.position.z = CONTACT_Z - midZ;
            assembly.add(strapMesh);
            assembly.add(caseMesh);
            const strapBaseZ = strapMesh.position.z;
            const caseBaseZ = caseMesh.position.z;

            let drag = false, prev = { x: 0, y: 0 };
            canvas.style.cursor = 'grab';
            canvas.addEventListener('mousedown', () => { drag = true; canvas.style.cursor = 'grabbing'; });
            canvas.addEventListener('mouseup', () => { drag = false; canvas.style.cursor = 'grab'; });
            canvas.addEventListener('mouseleave', () => { drag = false; canvas.style.cursor = 'grab'; });
            canvas.addEventListener('mousemove', e => {
                if (drag) {
                    pivot.rotation.y += (e.offsetX - prev.x) * 0.01;
                    pivot.rotation.x += (e.offsetY - prev.y) * 0.01;
                }
                prev = { x: e.offsetX, y: e.offsetY };
            });

            (function animate() {
                requestAnimationFrame(animate);
                if (!drag) pivot.rotation.y -= 0.005;
                // Both parts move symmetrically away from center
                strapMesh.position.z = strapBaseZ + (explodeAmount * EXPLODE_DIST);
                caseMesh.position.z = caseBaseZ - (explodeAmount * EXPLODE_DIST);
                renderer.render(scene, camera);
            })();
        }

        loader.load(casePath, geo => {
            geo.computeBoundingBox();
            const c = new THREE.Vector3(); geo.boundingBox.getCenter(c); geo.translate(-c.x, -c.y, -c.z);
            caseMesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0x555555, specular: 0xCCCCCC, shininess: 150, flatShading: false }));
            loaded++; if (loaded === 2) onBothLoaded();
        });

        loader.load(strapPath, geo => {
            geo.computeBoundingBox();
            const c = new THREE.Vector3(); geo.boundingBox.getCenter(c); geo.translate(-c.x, -c.y, -c.z);
            strapMesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0x555555, specular: 0xCCCCCC, shininess: 150, flatShading: false }));
            loaded++; if (loaded === 2) onBothLoaded();
        });

        const slider = document.getElementById('explode-range');
        if (slider) {
            slider.addEventListener('input', function() {
                explodeAmount = this.value / 100;
            });
        }

        if (isShowcase) {
            window.addEventListener('resize', () => {
                const nw = canvas.parentElement.clientWidth;
                const nh = canvas.parentElement.clientHeight;
                camera.aspect = nw / nh;
                camera.updateProjectionMatrix();
                renderer.setSize(nw, nh);
            });
        }
    }

    // Rocket viewer — 45° tilt, roll along body axis, slow yaw
    function setupRocket(canvas, stlPath) {
        const w = canvas.parentElement.clientWidth || 300;
        const h = canvas.parentElement.clientHeight || 300;
        const isShowcase = canvas.classList.contains('exp-showcase-canvas');
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, w / h, 1, 50000);
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: isShowcase });
        if (isShowcase) {
            renderer.setClearColor(0x000000, 0);
        } else {
            renderer.setClearColor(0xEDE8E2, 1);
        }
        renderer.setSize(w, h);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.render(scene, camera);
        canvas.classList.add('ready');

        scene.add(new THREE.AmbientLight(0xffffff, 0.35));
        const d1 = new THREE.DirectionalLight(0xffffff, 0.9); d1.position.set(2, 3, 2); scene.add(d1);
        const d2 = new THREE.DirectionalLight(0xffffff, 0.3); d2.position.set(-2, -1, -2); scene.add(d2);
        const d3 = new THREE.DirectionalLight(0xffffff, 0.5); d3.position.set(0, 0, -3); scene.add(d3);
        const d4 = new THREE.DirectionalLight(0xffffff, 0.25); d4.position.set(-3, 1, 0); scene.add(d4);

        new THREE.STLLoader().load(stlPath, geo => {
            geo.computeBoundingBox();
            const c = new THREE.Vector3(); geo.boundingBox.getCenter(c); geo.translate(-c.x, -c.y, -c.z);
            const mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0x555555, specular: 0xCCCCCC, shininess: 150, flatShading: false }));

            // Detect the rocket's longest axis (symmetry axis)
            const size = new THREE.Vector3();
            geo.boundingBox.getSize(size);

            // Align the longest axis to local Y so we can spin around Y
            if (size.x >= size.y && size.x >= size.z) {
                // X is longest — rotate 90° around Z to point along Y
                mesh.rotation.z = Math.PI / 2;
            } else if (size.z >= size.x && size.z >= size.y) {
                // Z is longest — rotate -90° around X to point along Y
                mesh.rotation.x = -Math.PI / 2;
            }
            // If Y is already longest, no alignment needed

            // Spinner group: rotates around Y = the rocket's body axis
            const spinner = new THREE.Group();
            spinner.add(mesh);

            // Tilt group: tilts the whole thing 45°
            const tilt = new THREE.Group();
            tilt.rotation.z = Math.PI / 3;
            tilt.add(spinner);
            scene.add(tilt);

            // Auto-fit camera — fill most of the viewport
            const maxDim = Math.max(size.x, size.y, size.z);
            const fovRad = camera.fov * (Math.PI / 180);
            var fitDist = (maxDim / 2) / Math.tan(fovRad / 2);
            fitDist *= 0.85;
            camera.position.set(0, 0, fitDist);

            let drag = false, prev = { x: 0, y: 0 };
            canvas.style.cursor = 'grab';

            (function animate() {
                requestAnimationFrame(animate);
                if (!drag) {
                    spinner.rotation.y += 0.012;
                }
                renderer.render(scene, camera);
            })();

            canvas.addEventListener('mousedown', () => { drag = true; canvas.style.cursor = 'grabbing'; });
            canvas.addEventListener('mouseup', () => { drag = false; canvas.style.cursor = 'grab'; });
            canvas.addEventListener('mouseleave', () => { drag = false; canvas.style.cursor = 'grab'; });
            canvas.addEventListener('mousemove', e => {
                if (drag) {
                    tilt.rotation.y += (e.offsetX - prev.x) * 0.01;
                    tilt.rotation.x += (e.offsetY - prev.y) * 0.01;
                }
                prev = { x: e.offsetX, y: e.offsetY };
            });

            if (isShowcase) {
                window.addEventListener('resize', () => {
                    const nw = canvas.parentElement.clientWidth;
                    const nh = canvas.parentElement.clientHeight;
                    camera.aspect = nw / nh;
                    camera.updateProjectionMatrix();
                    renderer.setSize(nw, nh);
                });
            }
        });
    }

    // Fins viewer — fins scattered chaotically, normalized to same size, each rolling on own axis
    function setupFins(canvas, finPaths) {
        const w = canvas.parentElement.clientWidth || 300;
        const h = canvas.parentElement.clientHeight || 300;
        const isTransparent = true;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, w / h, 1, 50000);
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setClearColor(0x000000, 0);
        renderer.setSize(w, h);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.render(scene, camera);
        canvas.classList.add('ready');

        scene.add(new THREE.AmbientLight(0xffffff, 0.35));
        const d1 = new THREE.DirectionalLight(0xffffff, 0.9); d1.position.set(2, 3, 2); scene.add(d1);
        const d2 = new THREE.DirectionalLight(0xffffff, 0.3); d2.position.set(-2, -1, -2); scene.add(d2);
        const d3 = new THREE.DirectionalLight(0xffffff, 0.5); d3.position.set(0, 0, -3); scene.add(d3);
        const d4 = new THREE.DirectionalLight(0xffffff, 0.25); d4.position.set(-3, 1, 0); scene.add(d4);

        const loader = new THREE.STLLoader();
        const spinners = [];
        let loaded = 0;
        let globalMaxDim = 0;
        const finData = [];

        // Single fin, shifted left in container
        var layouts = [
            { x: -0.04, y:  0.0, z:  0.0 }
        ];

        finPaths.forEach(function(path, i) {
            loader.load(path, function(geo) {
                geo.computeBoundingBox();
                var c = new THREE.Vector3(); geo.boundingBox.getCenter(c); geo.translate(-c.x, -c.y, -c.z);
                var size = new THREE.Vector3(); geo.boundingBox.getSize(size);
                var maxDim = Math.max(size.x, size.y, size.z);
                if (maxDim > globalMaxDim) globalMaxDim = maxDim;

                finData.push({ index: i, geo: geo, size: size, maxDim: maxDim });
                loaded++;
                if (loaded === finPaths.length) onAllLoaded();
            });
        });

        function onAllLoaded() {
            // Target size: all fins scaled to match the largest one
            var targetDim = globalMaxDim;
            var raycaster = new THREE.Raycaster();
            var mouse = new THREE.Vector2();
            var allMeshes = [];

            finData.sort(function(a, b) { return a.index - b.index; });
            finData.forEach(function(fd, i) {
                var scaleFactor = targetDim / fd.maxDim;
                var mesh = new THREE.Mesh(fd.geo, new THREE.MeshPhongMaterial({ color: 0x555555, specular: 0xCCCCCC, shininess: 150, flatShading: false }));
                mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);

                // Align longest axis to local Y for roll
                var s = fd.size;
                if (s.x >= s.y && s.x >= s.z) {
                    mesh.rotation.z = Math.PI / 2;
                } else if (s.z >= s.x && s.z >= s.y) {
                    mesh.rotation.x = -Math.PI / 2;
                }

                var spinner = new THREE.Group();
                spinner.add(mesh);
                scene.add(spinner);

                // Position using chaotic layout
                var L = layouts[i];
                var spread = targetDim * 2.8;
                spinner.position.x = L.x * spread;
                spinner.position.y = L.y * spread;
                spinner.position.z = L.z * spread;

                spinners.push({ spinner: spinner, speed: 0.006, paused: false });
                allMeshes.push(mesh);
            });

            // Fit camera
            var fovRad = camera.fov * (Math.PI / 180);
            var fitDist = (targetDim * 1.8) / Math.tan(fovRad / 2);
            fitDist *= 0.34;
            camera.position.set(0, 0, fitDist);

            var drag = false, prev = { x: 0, y: 0 };
            var activeFin = null; // index of the fin being dragged
            canvas.style.cursor = 'grab';

            function getHoveredFin(e) {
                var rect = canvas.getBoundingClientRect();
                mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
                raycaster.setFromCamera(mouse, camera);
                var hits = raycaster.intersectObjects(allMeshes, false);
                if (hits.length > 0) {
                    // Find which spinner this mesh belongs to
                    for (var i = 0; i < spinners.length; i++) {
                        if (spinners[i].spinner.children.indexOf(hits[0].object) !== -1) return i;
                    }
                }
                return -1;
            }

            canvas.addEventListener('mousedown', function(e) {
                drag = true;
                activeFin = getHoveredFin(e);
                if (activeFin >= 0) {
                    spinners[activeFin].paused = true;
                }
                canvas.style.cursor = 'grabbing';
            });
            canvas.addEventListener('mouseup', function() {
                drag = false;
                if (activeFin >= 0) spinners[activeFin].paused = false;
                activeFin = null;
                canvas.style.cursor = 'grab';
            });
            canvas.addEventListener('mouseleave', function() {
                drag = false;
                if (activeFin >= 0) spinners[activeFin].paused = false;
                activeFin = null;
                canvas.style.cursor = 'grab';
            });
            canvas.addEventListener('mousemove', function(e) {
                if (drag && activeFin !== null && activeFin >= 0) {
                    var s = spinners[activeFin].spinner;
                    s.rotation.y += (e.offsetX - prev.x) * 0.01;
                    s.rotation.x += (e.offsetY - prev.y) * 0.01;
                } else if (!drag) {
                    // Update cursor on hover
                    var hovered = getHoveredFin(e);
                    canvas.style.cursor = hovered >= 0 ? 'grab' : 'default';
                }
                prev = { x: e.offsetX, y: e.offsetY };
            });

            (function animate() {
                requestAnimationFrame(animate);
                spinners.forEach(function(s) {
                    if (!s.paused) {
                        s.spinner.rotation.y += s.speed;
                    }
                });
                renderer.render(scene, camera);
            })();
        }

        window.addEventListener('resize', function() {
            var nw = canvas.parentElement.clientWidth;
            var nh = canvas.parentElement.clientHeight;
            camera.aspect = nw / nh;
            camera.updateProjectionMatrix();
            renderer.setSize(nw, nh);
        });
    }

    const mc = document.getElementById('model-canvas');
    if (mc) setup(mc, './assets/models/iphone-mount.stl', 250, 0);
    const tc = document.getElementById('tricycle-canvas');
    if (tc) setup(tc, './assets/models/tricycle.stl', 2000, 0);
    const ac = document.getElementById('antenna-canvas');
    if (ac) setup(ac, './assets/models/AntennaClamp.stl', 250, Math.PI / 2);
    const ec = document.getElementById('explode-canvas');
    if (ec) setupExplode(ec, './assets/models/MagneticCase.stl', './assets/models/MagneticStrap.stl', 420);
    const rc = document.getElementById('rocket-canvas');
    if (rc) setupRocket(rc, './assets/models/rocket.stl');
    const fc = document.getElementById('fins-canvas');
    if (fc) setupFins(fc, [
        './assets/models/fin2.stl'
    ]);
})();