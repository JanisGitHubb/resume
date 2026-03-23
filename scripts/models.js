(function() {
    function setup(canvas, stlPath, camZ, initRotY) {
        const w = canvas.parentElement.clientWidth || 300;
        const h = canvas.parentElement.clientHeight || 300;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xEDE8E2);
        const camera = new THREE.PerspectiveCamera(45, w / h, 1, 5000);
        camera.position.set(0, 0, camZ);
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setClearColor(0xEDE8E2, 1);
        renderer.setSize(w, h);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.render(scene, camera);
        canvas.classList.add('ready');
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const d1 = new THREE.DirectionalLight(0xffffff, 0.8); d1.position.set(1, 1, 1); scene.add(d1);
        const d2 = new THREE.DirectionalLight(0xffffff, 0.4); d2.position.set(-1, -1, -1); scene.add(d2);
        new THREE.STLLoader().load(stlPath, geo => {
            const mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0xE84A1C, specular: 0x333333, shininess: 40 }));
            geo.computeBoundingBox();
            const c = new THREE.Vector3(); geo.boundingBox.getCenter(c); geo.translate(-c.x, -c.y, -c.z);
            mesh.rotation.x = Math.PI;
            mesh.rotation.y = initRotY || 0;
            scene.add(mesh);
            (function animate() { requestAnimationFrame(animate); mesh.rotation.y += 0.005; renderer.render(scene, camera); })();
            let drag = false, prev = { x: 0, y: 0 };
            canvas.addEventListener('mousedown', () => drag = true);
            canvas.addEventListener('mouseup', () => drag = false);
            canvas.addEventListener('mousemove', e => {
                if (drag) { mesh.rotation.y += (e.offsetX - prev.x) * 0.01; mesh.rotation.x += (e.offsetY - prev.y) * 0.01; }
                prev = { x: e.offsetX, y: e.offsetY };
            });
        });
    }

    // Explode viewer — assembly stands upright, spins around vertical Y axis
    function setupExplode(canvas, casePath, strapPath, camZ) {
        const w = canvas.parentElement.clientWidth || 300;
        const h = canvas.parentElement.clientHeight || 300;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xEDE8E2);
        const camera = new THREE.PerspectiveCamera(45, w / h, 1, 5000);
        camera.position.set(0, 0, camZ);
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setClearColor(0xEDE8E2, 1);
        renderer.setSize(w, h);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.render(scene, camera);
        canvas.classList.add('ready');

        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const d1 = new THREE.DirectionalLight(0xffffff, 0.8); d1.position.set(1, 1, 1); scene.add(d1);
        const d2 = new THREE.DirectionalLight(0xffffff, 0.4); d2.position.set(-1, -1, -1); scene.add(d2);

        // Outer pivot: spins around Y (vertical on screen) — same as all other models
        const pivot = new THREE.Group();
        scene.add(pivot);

        // Inner assembly: holds both parts, rotated so Z points up (becomes Y on screen)
        const assembly = new THREE.Group();
        // STL: X=long(207), Y=medium(75), Z=thin(14)
        // Want: X pointing up on screen, Z facing camera
        // Rotate Z by +90° to put X axis pointing up, then flip with X rotation
        assembly.rotation.z = -Math.PI / 2;
        assembly.rotation.x = Math.PI;
        pivot.add(assembly);

        let caseMesh = null, strapMesh = null;
        let explodeAmount = 0;

        const CONTACT_Z = -10.59;
        const EXPLODE_DIST = 50;

        const loader = new THREE.STLLoader();
        let loaded = 0;

        function onBothLoaded() {
            caseMesh.rotation.z = Math.PI; // Flip for notch alignment

            // Position in STL Z-space: strap at 0, case touching below
            strapMesh.position.z = 0;
            caseMesh.position.z = CONTACT_Z;

            // Center both parts together in X and Y (shared center)
            // Strap is wider in Y, so we average the X/Y centers
            // Both geos are already individually centered, so just offset them equally
            // The midpoint in Z when assembled: (0 + CONTACT_Z) / 2
            const midZ = CONTACT_Z / 2;
            strapMesh.position.z = -midZ;      // shift strap up
            caseMesh.position.z = CONTACT_Z - midZ; // shift case to keep same relative gap

            assembly.add(strapMesh);
            assembly.add(caseMesh);

            const strapBaseZ = strapMesh.position.z;
            const caseBaseZ = caseMesh.position.z;

            let drag = false, prev = { x: 0, y: 0 };
            canvas.addEventListener('mousedown', () => drag = true);
            canvas.addEventListener('mouseup', () => drag = false);
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

                // Explode from base positions
                strapMesh.position.z = strapBaseZ;
                caseMesh.position.z = caseBaseZ - (explodeAmount * EXPLODE_DIST);

                renderer.render(scene, camera);
            })();
        }

        loader.load(casePath, geo => {
            geo.computeBoundingBox();
            const c = new THREE.Vector3();
            geo.boundingBox.getCenter(c);
            geo.translate(-c.x, -c.y, -c.z);
            caseMesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0xE84A1C, specular: 0x333333, shininess: 40 }));
            loaded++;
            if (loaded === 2) onBothLoaded();
        });

        loader.load(strapPath, geo => {
            geo.computeBoundingBox();
            const c = new THREE.Vector3();
            geo.boundingBox.getCenter(c);
            geo.translate(-c.x, -c.y, -c.z);
            strapMesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0xCC3D15, specular: 0x333333, shininess: 40 }));
            loaded++;
            if (loaded === 2) onBothLoaded();
        });

        const slider = document.getElementById('explode-range');
        if (slider) {
            slider.addEventListener('input', function() {
                explodeAmount = this.value / 100;
            });
        }
    }

    const mc = document.getElementById('model-canvas');
    if (mc) setup(mc, './assets/models/iphone-mount.stl', 250, 0);
    const tc = document.getElementById('tricycle-canvas');
    if (tc) setup(tc, './assets/models/tricycle.stl', 2000, 0);
    const ac = document.getElementById('antenna-canvas');
    if (ac) setup(ac, './assets/models/AntennaClamp.stl', 250, Math.PI / 2);

    const ec = document.getElementById('explode-canvas');
    if (ec) setupExplode(ec, './assets/models/MagneticCase.stl', './assets/models/MagneticStrap.stl', 420);
})();