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
    const mc = document.getElementById('model-canvas');
    if (mc) setup(mc, './assets/models/iphone-mount.stl', 250, 0);
    const tc = document.getElementById('tricycle-canvas');
    if (tc) setup(tc, './assets/models/tricycle.stl', 2000, 0);
    const ac = document.getElementById('antenna-canvas');
    if (ac) setup(ac, './assets/models/AntennaClamp.stl', 250, Math.PI / 2);
})();
