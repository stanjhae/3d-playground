const secondFloor = document.querySelector('#secondFloor'); // Get canvas
const thirdFloor = document.querySelector('#thirdFloor'); // Get canvas
const BigLectureHall = document.querySelector('#BigLectureHall'); // Get canvas
const laboratory = document.querySelector('#laboratory'); // Get canvas
const blocker = document.querySelector('#blocker');
const entrance = document.querySelector('#entrance'); // Get startButton
const cafeteria = document.querySelector('#cafeteria'); // Get startButton

export const locations = (camera, velocity, pointerControls) => {
  cafeteria.addEventListener('click', function () {
    camera.position.set(-474, 100, 469);
    camera.lookAt(1850, 100, 2500);
    velocity.y = 100
  });
  entrance.addEventListener('click', function () {
    camera.position.set(-110, 100, -2862);
    camera.lookAt(140, 100, 2100);
    velocity.y = 100
  });
  secondFloor.addEventListener('click', function () {
    camera.position.set(-518, 900, 792);
    camera.lookAt(-500, 875, 200);
    velocity.y = 900
  });
  thirdFloor.addEventListener('click', function () {
    camera.position.set(-571, 1250, 989);
    camera.lookAt(850, 1000, -1110);
    velocity.y = 1250
  });

  BigLectureHall.addEventListener('click', function () {
    camera.position.set(866, 250, -1130);
    camera.lookAt(4000, 150, 3000);
    velocity.y = 250

  });
  laboratory.addEventListener('click', function () {
    camera.position.set(-2290, 100, -1469);
    camera.lookAt(-1000, 200, -4100);
    velocity.y = 100

  });
  const onKeyDown = function (event) {
    if (blocker.style.visibility === 'visible') {
      return 0;
    }
    pointerControls.lock()
    switch (event.keyCode) {
      case 49: //1: Cafeteria
        camera.position.set(-474, 100, 469);
        camera.lookAt(1840, 100, 2100);
        velocity.y = 100
        break;
      case 50: //2: Entrance
        camera.position.set(-110, 100, -2862);
        camera.lookAt(140, 100, 2100);
        velocity.y = 100
        break;
      case 51: //3: second floor
        camera.position.set(-250, 875, 547);
        camera.lookAt(-200, 875, 200);
        velocity.y = 875
        break;
      case 52: //4: third floor
        camera.position.set(-571, 1250, 989);
        camera.lookAt(850, 1000, -1110);
        velocity.y = 1250
        break;
      case 53: //5: big lecture hall
        camera.position.set(866, 250, -1130);
        camera.lookAt(5000, 150, 2000);
        velocity.y = 250
        break;
      case 54: //6: laboratories
        camera.position.set(-1894, 144, -1842);
        camera.lookAt(140, 100, 2100);
        velocity.y = 144
        break;
    }
  };

  document.addEventListener('keydown', onKeyDown);
}
