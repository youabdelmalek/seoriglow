import { ThemeEvents } from '@theme/events';

class ProductMediaGallery extends HTMLElement {
  connectedCallback() {
    const closestSection = this.closest('.shopify-section, dialog');
    if (!closestSection) return;
    closestSection.addEventListener(ThemeEvents.variantUpdated, this.updateMediaGallery);
  }

  disconnectedCallback() {
    const closestSection = this.closest('.shopify-section, dialog');
    if (!closestSection) return;
    closestSection.removeEventListener(ThemeEvents.variantUpdated, this.updateMediaGallery);
  }

  updateMediaGallery = (event) => {
    const pinnedMediaId = this.dataset.selectedMediaId;
    const featuredMediaId = pinnedMediaId || event?.detail?.resource?.featured_media?.id;
    const currentMediaGallery = this.querySelector('slider-component');
    if (!currentMediaGallery) return;

    if (!featuredMediaId) return;

    this.goToMedia(currentMediaGallery, String(featuredMediaId));

    if (pinnedMediaId) {
      delete this.dataset.selectedMediaId;
    }
  };

  goToMedia(mediaGallery, featuredMediaId) {
    if (!mediaGallery || !featuredMediaId) return;

    const moveToMedia = () => {
      const slides = Array.from(mediaGallery.querySelectorAll('[data-ref="main-slider"] .splide__slide'));
      if (!slides.length) return;

      const targetIndex = slides.findIndex((slide) => slide.dataset.mediaId === featuredMediaId);
      if (targetIndex < 0) return;

      if (mediaGallery.slider && typeof mediaGallery.slider.go === 'function') {
        mediaGallery.slider.go(targetIndex);
      }
    };

    requestAnimationFrame(() => {
      moveToMedia();

      if (!mediaGallery.slider) {
        requestAnimationFrame(moveToMedia);
      }
    });
  }
}

if (!customElements.get('product-media-gallery')) {
  customElements.define('product-media-gallery', ProductMediaGallery);
}
