/* Model colour and lighting for the site look: bright orange models with real shading
   (low ambient, key light from the front-left, warm rim from behind). */
(function () {
    'use strict';
    var MODEL = 0xff5a1f, SPEC = 0x553322, rim = null, sky = null;
    function relight(scene) {
        var lights = [];
        scene.children.forEach(function (o) { if (o.isLight && o !== rim && o !== sky) lights.push(o); });
        var amb = lights.filter(function (l) { return l.isAmbientLight; })[0];
        var dirs = lights.filter(function (l) { return l.isDirectionalLight; });
        if (!rim) {
            rim = new THREE.DirectionalLight(0xffe2cc, 0.45); rim.position.set(-1.5, 1.2, -3); scene.add(rim);
            sky = new THREE.HemisphereLight(0xffffff, 0x8a5a3c, 0.25); scene.add(sky);
        }
        if (amb) amb.intensity = 0.42;
        if (dirs[0]) { dirs[0].intensity = 0.85; dirs[0].position.set(-2.5, 3, 4); }
        if (dirs[1]) dirs[1].intensity = 0.22;
    }
    function recolour() {
        var scene = window.V2 && window.V2.scene();
        if (!scene) return;
        relight(scene);
        scene.traverse(function (o) {
            if (!o.isMesh || !o.material.userData.themed) return;
            o.material.color.setHex(MODEL); o.material.specular.setHex(SPEC); o.material.shininess = 60;
        });
    }
    document.addEventListener('DOMContentLoaded', function () { recolour(); setInterval(recolour, 600); });   // models load over a few seconds
})();
