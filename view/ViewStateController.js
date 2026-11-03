export class ViewStateController {
  constructor() {
    this.state = {
      previewMode: 'SOURCE',
      supportRenderMode: 'SYMBOL',
      verificationMode: false,
      theme: 'NavisDark',
      selectedObjectId: null,
      filters: {
        showOnlyLossy: false,
        showOnlyReconstructed: false,
        showOnlyExportable: false,
      },
    };
  }

  update(patch) {
    this.state = { ...this.state, ...patch };
    return this.state;
  }
}
