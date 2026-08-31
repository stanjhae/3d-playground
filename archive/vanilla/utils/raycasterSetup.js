export const raycasterSetup = () => {
  const leftRaycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(1, 0, 0));
  const rightRaycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(-1, 0, 0));

  return {leftRaycaster, rightRaycaster}
}
