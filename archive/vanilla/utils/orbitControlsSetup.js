export const orbitControlsSetup = (camera, canvas) => {

  const controls = new THREE.OrbitControls(camera, canvas);

  controls.maxPolarAngle = 1.57
  // controls.keyPanSpeed = 20

  controls.update();

  return controls
}
