 const startButton = document.querySelector('#startButton'); // Get canvas

export const pointerControlsSetup = (camera, canvas, velocity, scene, movement) => {

  const onKeyDown = function (event) {
    switch (event.keyCode) {

      case 38: // up
      case 87: // w
        movement.forward = true;
        velocity.z = 30;
        break;

      case 37: // left
      case 65: // a
        movement.left = true;
        velocity.x = -10;
        break;

      case 40: // down
      case 83: // s
        movement.backward = true;
        velocity.z = -30;
        break;

      case 39: // right
      case 68: // d
        movement.right = true;
        velocity.x = 10;
        break;

      case 82: // r
        movement.up = true;
        break;

      case 70: // f
        movement.down = true;
        break;

    }
  };

  const onKeyUp = function (event) {

    switch (event.keyCode) {

      case 38: // up
      case 87: // w
        movement.forward = false;
        movement.reset = true
        break;

      case 37: // left
      case 65: // a
        movement.left = false;
        break;

      case 40: // down
      case 83: // s
        movement.backward = false;
        break;

      case 39: // right
      case 68: // d
        movement.right = false;
        break;

      case 82: // r
        movement.up = false;
        break;

      case 70: // f
        movement.down = false;
        break;

    }
    velocity.z = 0;
    velocity.x = 0;
  };

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);


  const controls = new THREE.PointerLockControls(camera, canvas)
  scene.add(controls.getObject());

  startButton.addEventListener('click', function () {
    controls.lock();
  });

  return controls
}
