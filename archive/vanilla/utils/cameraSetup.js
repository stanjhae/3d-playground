const cameraOptions = {
  fov: 50,
  aspect: window.innerWidth / window.innerHeight,
  near: 0.1,
  far: 200000
};

export const cameraSetup = () => {
  return new THREE.PerspectiveCamera(cameraOptions.fov, cameraOptions.aspect, cameraOptions.near, cameraOptions.far);
}
