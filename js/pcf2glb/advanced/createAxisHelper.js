import { ViewHelper } from 'three/addons/helpers/ViewHelper.js';

export function createAxisHelper(camera, domElement) {
  const viewHelper = new ViewHelper(camera, domElement);

  return {
    helper: viewHelper,
    render: (renderer) => {
        viewHelper.render(renderer);
    },
    handleClick: (event) => {
        if (viewHelper.handleClick(event)) {
            return true;
        }
        return false;
    },
    dispose: () => {
        // ViewHelper might not have a dispose method in older Three.js, but let's be safe
        if (viewHelper.dispose) viewHelper.dispose();
    }
  };
}
