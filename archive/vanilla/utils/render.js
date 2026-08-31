import {resizeRenderer} from "./resizeRenderer.js";
import {raycasterSetup} from "./raycasterSetup.js";

const xyzPosition = document.querySelector('#xyzPosition');

const {leftRaycaster, rightRaycaster} = raycasterSetup();

const intersects = {
  left: undefined,
  right: undefined
}

export const render = (scene, camera, renderer, pointerControls, movement, velocity, position) => {
  xyzPosition.innerHTML = `X:${camera.position.x.toFixed(0)} Y:${camera.position.y.toFixed(0)} Z:${camera.position.z.toFixed(0)}`;

  if (pointerControls.isLocked) {

    leftRaycaster.ray.origin.copy(pointerControls.getObject().position);
    rightRaycaster.ray.origin.copy(pointerControls.getObject().position);
    if (scene.children.length > 9) {
      intersects.left = leftRaycaster.intersectObjects(scene.children[scene.children.length-1].children, true);
      intersects.right = rightRaycaster.intersectObjects(scene.children[scene.children.length-1].children, true);
      if (intersects.left.length) {
        if (intersects.left[0].distance < 50) {
          if (movement.left) velocity.x = 0;
        }
      }
      if (intersects.right.length) {
        if (intersects.right[0].distance < 50) {
          if (movement.right) velocity.x = 0;
        }
      }
    }

    if (movement.up) {
      velocity.y += 25
    }
    if (movement.down && camera.position.y > 100) {
      velocity.y -= 25
    }

    pointerControls.moveForward(velocity.z);
    pointerControls.moveRight(velocity.x);
    pointerControls.getObject().position.y = velocity.y;

  }

  if (resizeRenderer(renderer)) {
    const canvas = renderer.domElement;
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  }

  renderer.render(scene, camera);

  requestAnimationFrame(() => render(scene, camera, renderer, pointerControls, movement, velocity, position));
}
