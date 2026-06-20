import { VariantUpdatedEvent, VariantSelectedEvent } from '@theme/events';
import { formatMoney } from '@theme/utilities';
// import { morph } from '@theme/morph';

class VariantPicker extends HTMLElement {
  // Contrôleur pour annuler les requêtes en cours
  #abortController;
  #dialogComponent;
  #hiddenVariantInput;
  #hiddenSelects = [];
  #selectedVariantPreview;
  #selectedVariantTitle;
  #selectedVariantOptions;
  #selectedVariantImage;
  #activeTab = 'single';
  #activeSelectionTarget = 'single';
  #singleBasePrice = null;
  #singleBaseCompareAtPrice = null;

  connectedCallback() {
    this.addEventListener('change', this.variantChanged.bind(this));
    this.addEventListener('click', this.handleClick.bind(this));

    this.#bindElements();
    this.normalizeProductUrl();
    this.#updatePreviewFromCurrentSelection();
  }

  normalizeProductUrl() {
    if (Theme.template.name !== 'product') return;

    const url = new URL(window.location.href);
    url.searchParams.delete('variant');

    if (url.href !== window.location.href) {
      history.replaceState({}, '', url.toString());
    }
  }

  #bindElements() {
    this.#hiddenVariantInput = this.querySelector('input[name="id"]') || this.querySelector('input[data-ref="single-variant-id"]');
    this.#hiddenSelects = Array.from(this.querySelectorAll('select[name^="option-"]'));
    this.#dialogComponent = this.querySelector('dialog-component');
    this.#selectedVariantPreview = this.querySelector('[data-ref="selected-variant-preview"]');
    this.#selectedVariantTitle = this.querySelector('[data-ref="selected-variant-title"]');
    this.#selectedVariantOptions = this.querySelector('[data-ref="selected-variant-options"]');
    this.#selectedVariantImage = this.querySelector('[data-ref="selected-variant-image"]');

    const addToCartButtonContainer = this.closest('product-form')?.querySelector('[data-ref="add-to-cart-button-container"]');
    if (addToCartButtonContainer) {
      this.#singleBasePrice = addToCartButtonContainer.dataset.price || null;
      this.#singleBaseCompareAtPrice = addToCartButtonContainer.dataset.compareAtPrice || null;
    }

    this.#syncSubmissionInputs();
    this.#syncAddToCartPricing();
    this.#updateBundleAddToCartState();
    this.#syncBundlePreviewStates();
  }

  #syncBundlePreviewStates() {
    this.querySelectorAll('[data-ref="bundle-preview"]').forEach((previewButton) => {
      const bundleTab = previewButton.dataset.bundle;
      const slot = parseInt(previewButton.dataset.slot || '0', 10);
      if (!bundleTab || Number.isNaN(slot) || slot < 1) return;

      const selectedId = this.#getBundleInput('bundle-selection-id', bundleTab, slot)?.value || '';
      const plus = previewButton.querySelector('[data-ref="bundle-plus"]');
      const image = previewButton.querySelector('[data-ref="bundle-image"]');
      const imageWrapper = previewButton.querySelector('[data-ref="bundle-image-wrapper"]');

      if (selectedId) {
        previewButton.classList.remove('variant-picker__single-preview--empty');
        plus?.classList.add('visually-hidden');
        return;
      }

      previewButton.classList.add('variant-picker__single-preview--empty');
      plus?.classList.remove('visually-hidden');

      if (image) {
        image.removeAttribute('src');
        image.alt = '';
      }
      imageWrapper?.classList.add('visually-hidden');
    });
  }

  /**
   * Gère l'événement de changement de variante.
   * @param {Event} event - L'événement de changement de variante.
   */
  variantChanged(event) {
    if (!(event.target instanceof HTMLSelectElement) || !event.target.name.startsWith('option-')) return;

    // Met à jour l'option sélectionnée dans l'interface
    this.updateSelectedOption(event.target);

    // Déclenche un événement personnalisé pour notifier la sélection
    this.dispatchEvent(new VariantSelectedEvent({ id: event.target.dataset.optionValueId ?? '' }));

    // Lance la requête pour mettre à jour la section
    this.fetchUpdatedSection(this.buildRequestUrl());

    // Met à jour l'URL avec l'ID de variante sur les pages produit
    this.updateUrl(event.target);
  }

  handleClick(event) {
    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) return;

    const action = actionElement.dataset.action;

    if (action === 'switch-tab') {
      event.preventDefault();
      this.switchTab(actionElement.dataset.tab);
      return;
    }

    if (action === 'open-popup') {
      event.preventDefault();
      this.openPopup(actionElement.dataset.targetKey || 'single');
      return;
    }

    if (action === 'select-variant') {
      event.preventDefault();
      this.selectVariantCard(actionElement);
      return;
    }

    if (action === 'confirm-selection') {
      event.preventDefault();
      this.confirmSelection();
    }
  }

  openPopup(targetKey = 'single') {
    if (!this.#dialogComponent) return;
    this.#activeSelectionTarget = targetKey;
    this.#dialogComponent.open();
    this.#highlightCurrentPopupSelection();
  }

  switchTab(tabName) {
    if (!tabName || this.#activeTab === tabName) return;

    this.#activeTab = tabName;
    this.querySelectorAll('[data-ref="variant-tabs"] .variant-picker__tab').forEach((button) => {
      button.classList.toggle('variant-picker__tab--active', button.dataset.tab === tabName);
    });

    this.querySelectorAll('[data-panel]').forEach((panel) => {
      panel.classList.toggle('variant-picker__panel--active', panel.dataset.panel === tabName);
    });

    this.#syncSubmissionInputs();
    this.#syncAddToCartPricing();
    this.#updateBundleAddToCartState();

    if (tabName !== 'bundle-1') {
      if (!this.#isBundleTab(tabName)) {
        const firstHiddenSelect = this.#hiddenSelects[0];
        if (firstHiddenSelect && this.#hiddenVariantInput?.value) {
          firstHiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }
  }

  #isBundleTab(tabName) {
    return /^bundle-\d+$/.test(tabName || '');
  }

  #getBundleNumber(tabName) {
    if (!this.#isBundleTab(tabName)) return null;
    return tabName.split('-')[1];
  }

  #getBundleSelectionCount(bundleTab) {
    const bundleNumber = this.#getBundleNumber(bundleTab);
    if (!bundleNumber) return 0;

    const count = parseInt(this.#getBundleDatasetValue(bundleNumber, 'Count') || '0', 10);
    if (Number.isNaN(count) || count < 1) return 0;
    return count;
  }

  #getBundleDatasetValue(bundleNumber, suffix) {
    const camelKey = `bundle${bundleNumber}${suffix}`;
    const dashedKey = `bundle-${bundleNumber}${suffix}`;
    return this.dataset[camelKey] ?? this.dataset[dashedKey] ?? '';
  }

  #getBundleInput(refName, bundleTab, slot = null) {
    if (!bundleTab) return null;

    let selector = `[data-ref="${refName}"][data-bundle="${bundleTab}"]`;
    if (slot != null) {
      selector += `[data-slot="${slot}"]`;
    }

    return this.querySelector(selector);
  }

  #getBundleTabFromTarget(targetKey) {
    const match = (targetKey || '').match(/^(bundle-\d+)-item-(\d+)$/);
    if (!match) return null;
    return match[1];
  }

  #getBundleSlotFromTarget(targetKey) {
    const match = (targetKey || '').match(/^(bundle-\d+)-item-(\d+)$/);
    if (!match) return null;
    return parseInt(match[2], 10);
  }

  #setPopupCardSelectionByVariantId(variantId) {
    this.querySelectorAll('[data-action="select-variant"]').forEach((item) => {
      item.classList.toggle('variant-picker-popup__item--selected', item.dataset.variantId === variantId);
    });
  }

  #getCurrentVariantIdForTarget(targetKey) {
    if (targetKey === 'single') {
      return this.#hiddenVariantInput?.value || '';
    }

    const bundleTab = this.#getBundleTabFromTarget(targetKey);
    const slot = this.#getBundleSlotFromTarget(targetKey);
    if (!bundleTab || !slot) return '';

    return this.#getBundleInput('bundle-selection-id', bundleTab, slot)?.value || '';
  }

  #highlightCurrentPopupSelection() {
    const currentVariantId = this.#getCurrentVariantIdForTarget(this.#activeSelectionTarget);
    if (!currentVariantId) return;
    this.#setPopupCardSelectionByVariantId(currentVariantId);
  }

  selectVariantCard(card) {
    if (!(card instanceof HTMLElement) || card.disabled) return;
    this.#setPopupCardSelectionByVariantId(card.dataset.variantId || '');
    this.confirmSelection(card);
  }

  #updateBundleSlot(targetKey, variantData) {
    const bundleTab = this.#getBundleTabFromTarget(targetKey);
    const slot = this.#getBundleSlotFromTarget(targetKey);
    if (!bundleTab || !slot) return;

    const previewButton = this.querySelector(`[data-ref="bundle-preview"][data-target-key="${targetKey}"]`);
    if (!previewButton || !variantData) return;

    const idInput = this.#getBundleInput('bundle-selection-id', bundleTab, slot);
    const propertyTitleInput = this.#getBundleInput('bundle-selection-title', bundleTab, slot);
    const propertyOptionsInput = this.#getBundleInput('bundle-selection-options', bundleTab, slot);
    const propertyImageInput = this.#getBundleInput('bundle-selection-image', bundleTab, slot);
    const propertyDisplayInput = this.#getBundleInput('bundle-selection-display', bundleTab, slot);

    if (idInput) idInput.value = variantData.id;
    if (propertyTitleInput) propertyTitleInput.value = variantData.title;
    const formattedOptions = Object.values(variantData.options).filter(Boolean).join(' • ');
    if (propertyOptionsInput) propertyOptionsInput.value = formattedOptions;
    if (propertyImageInput) propertyImageInput.value = variantData.image || '';
    if (propertyDisplayInput) {
      propertyDisplayInput.value = formattedOptions ? `${variantData.title} — ${formattedOptions}` : variantData.title;
    }

    const title = previewButton.querySelector('[data-ref="bundle-title"]');
    const options = previewButton.querySelector('[data-ref="bundle-options"]');
    const cta = previewButton.querySelector('[data-ref="bundle-cta"]');
    const plus = previewButton.querySelector('[data-ref="bundle-plus"]');
    const image = previewButton.querySelector('[data-ref="bundle-image"]');
    const imageWrapper = previewButton.querySelector('[data-ref="bundle-image-wrapper"]');

    previewButton.classList.remove('variant-picker__single-preview--empty');
    plus?.classList.add('visually-hidden');

    if (title) title.textContent = variantData.title;
    if (options) options.textContent = Object.values(variantData.options).filter(Boolean).join(' • ');
    if (cta) cta.textContent = 'Edit';

    if (image && imageWrapper) {
      if (variantData.image) {
        image.src = variantData.image;
        image.alt = variantData.title;
        imageWrapper.classList.remove('visually-hidden');
      } else {
        image.removeAttribute('src');
        image.alt = '';
        imageWrapper.classList.add('visually-hidden');
      }
    }
  }

  confirmSelection(selectedCard = null) {
    const cardToApply =
      selectedCard instanceof HTMLElement
        ? selectedCard
        : this.querySelector('[data-action="select-variant"].variant-picker-popup__item--selected');

    const selectedCardElement =
      cardToApply instanceof HTMLElement ? cardToApply : null;

    if (!selectedCardElement) return;

    const selectedCardInPopup = this.querySelector(
      `[data-action="select-variant"][data-variant-id="${selectedCardElement.dataset.variantId || ''}"]`,
    );

    if (!(selectedCardInPopup instanceof HTMLElement)) return;

    this.#setPopupCardSelectionByVariantId(selectedCardInPopup.dataset.variantId || '');

    const variantData = this.#getVariantDataFromCard(selectedCardInPopup);
    if (!variantData) return;

    if (this.#activeSelectionTarget === 'single') {
      if (this.#hiddenVariantInput) {
        this.#hiddenVariantInput.value = variantData.id;
      }

      this.#updateHiddenSelects(variantData);
      this.#updatePreviewFromVariantData(variantData);
      this.#syncProductMedia(variantData);

      const firstHiddenSelect = this.#hiddenSelects[0];
      if (firstHiddenSelect) {
        firstHiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      this.#updateBundleSlot(this.#activeSelectionTarget, variantData);
      this.#syncProductMedia(variantData);
      this.#syncSubmissionInputs();
      this.#syncAddToCartPricing();
      this.#updateBundleAddToCartState();
    }

    const dialogElement = this.querySelector('dialog');
    if (dialogElement && dialogElement.open) {
      dialogElement.close();
    }
  }

  #syncSubmissionInputs() {
    const bundleMode = this.#isBundleTab(this.#activeTab);

    if (!this.#hiddenVariantInput) {
      return;
    }

    this.querySelectorAll('[data-ref="bundle-product-id"]').forEach((input) => input.removeAttribute('name'));
    this.querySelectorAll('[data-ref="bundle-property-bundle-label"]').forEach((input) => input.removeAttribute('name'));
    this.querySelectorAll('[data-ref="bundle-selection-title"]').forEach((input) => input.removeAttribute('name'));
    this.querySelectorAll('[data-ref="bundle-selection-options"]').forEach((input) => input.removeAttribute('name'));
    this.querySelectorAll('[data-ref="bundle-selection-image"]').forEach((input) => input.removeAttribute('name'));
    this.querySelectorAll('[data-ref="bundle-selection-id"]').forEach((input) => input.removeAttribute('name'));
    this.querySelectorAll('[data-ref="bundle-selection-display"]').forEach((input) => input.removeAttribute('name'));

    if (!bundleMode) {
      this.#hiddenVariantInput.name = 'id';
      return;
    }

    this.#hiddenVariantInput.removeAttribute('name');

    const activeBundle = this.#activeTab;
    const bundleProductInput = this.#getBundleInput('bundle-product-id', activeBundle);
    if (bundleProductInput?.value) {
      bundleProductInput.name = 'id';
    } else {
      bundleProductInput?.removeAttribute('name');
    }

    const bundleLabelInput = this.#getBundleInput('bundle-property-bundle-label', activeBundle);
    if (bundleLabelInput) {
      bundleLabelInput.name = 'properties[Bundle]';
    }

    const selectionCount = this.#getBundleSelectionCount(activeBundle);
    for (let slot = 1; slot <= selectionCount; slot += 1) {
      const titleInput = this.#getBundleInput('bundle-selection-title', activeBundle, slot);
      const optionsInput = this.#getBundleInput('bundle-selection-options', activeBundle, slot);
      const imageInput = this.#getBundleInput('bundle-selection-image', activeBundle, slot);
      const idInput = this.#getBundleInput('bundle-selection-id', activeBundle, slot);
      const displayInput = this.#getBundleInput('bundle-selection-display', activeBundle, slot);

      if (titleInput) titleInput.name = `properties[_selection_${slot}_title]`;
      if (optionsInput) optionsInput.name = `properties[_selection_${slot}_options]`;
      if (imageInput) imageInput.name = `properties[_selection_${slot}_image]`;
      if (idInput) idInput.name = `properties[_selection_${slot}_id]`;
      if (displayInput) displayInput.name = `properties[Selection ${slot}]`;
    }
  }

  #syncAddToCartPricing() {
    const addToCartButtonContainer = this.closest('product-form')?.querySelector('[data-ref="add-to-cart-button-container"]');
    if (!addToCartButtonContainer) {
      return;
    }

    if (!this.#isBundleTab(this.#activeTab)) {
      if (this.#singleBasePrice != null) {
        addToCartButtonContainer.dataset.price = this.#singleBasePrice;
      }

      if (this.#singleBaseCompareAtPrice != null && this.#singleBaseCompareAtPrice !== '') {
        addToCartButtonContainer.dataset.compareAtPrice = this.#singleBaseCompareAtPrice;
      } else {
        delete addToCartButtonContainer.dataset.compareAtPrice;
      }

      const firstHiddenSelect = this.#hiddenSelects[0];
      if (firstHiddenSelect && this.#hiddenVariantInput?.value) {
        firstHiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }

      return;
    }

    const bundleNumber = this.#getBundleNumber(this.#activeTab);
    if (!bundleNumber) return;

    addToCartButtonContainer.dataset.price = this.#getBundleDatasetValue(bundleNumber, 'Price') || '0';

    const compareAtPrice = this.#getBundleDatasetValue(bundleNumber, 'CompareAtPrice');
    if (compareAtPrice) {
      addToCartButtonContainer.dataset.compareAtPrice = compareAtPrice;
    } else {
      delete addToCartButtonContainer.dataset.compareAtPrice;
    }

    const productQuantityInput = this.closest('product-form')?.querySelector('[data-ref="product-quantity-selector"] input[name="quantity"]');
    if (productQuantityInput) {
      productQuantityInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    this.#renderAddToCartPrice(addToCartButtonContainer);
  }

  #renderAddToCartPrice(addToCartButtonContainer) {
    if (!addToCartButtonContainer) return;

    const rawPrice = parseInt(addToCartButtonContainer.dataset.price, 10);
    if (Number.isNaN(rawPrice)) return;

    const priceElement = addToCartButtonContainer.querySelector('[data-ref="price"]');
    if (priceElement) {
      priceElement.innerHTML = formatMoney(rawPrice);
    }

    const compareAtPriceElement = addToCartButtonContainer.querySelector('[data-ref="compare-at-price"]');
    if (!compareAtPriceElement) return;

    const rawCompareAtPrice = parseInt(addToCartButtonContainer.dataset.compareAtPrice, 10);
    if (!Number.isNaN(rawCompareAtPrice) && rawCompareAtPrice > rawPrice) {
      compareAtPriceElement.innerHTML = formatMoney(rawCompareAtPrice);
    } else {
      compareAtPriceElement.innerHTML = '';
    }
  }

  #updateBundleAddToCartState() {
    const addToCartButton = this.closest('product-form')?.querySelector('[data-ref="add-to-cart-button"]');
    if (!addToCartButton) return;

    if (!this.#isBundleTab(this.#activeTab)) {
      addToCartButton.disabled = !Boolean(this.#hiddenVariantInput?.value);
      return;
    }

    const activeBundle = this.#activeTab;
    const selectionCount = this.#getBundleSelectionCount(activeBundle);
    const hasBundleProduct = Boolean(this.#getBundleInput('bundle-product-id', activeBundle)?.value);

    let allSelections = true;
    for (let slot = 1; slot <= selectionCount; slot += 1) {
      if (!this.#getBundleInput('bundle-selection-id', activeBundle, slot)?.value) {
        allSelections = false;
        break;
      }
    }

    addToCartButton.disabled = !(hasBundleProduct && allSelections && selectionCount > 0);
  }

  #getVariantDataFromCard(card) {
    if (!(card instanceof HTMLElement)) return null;
    const dataset = card.dataset;
    const options = {};

    Object.keys(dataset).forEach((key) => {
      if (key.startsWith('option')) {
        options[key] = dataset[key];
      }
    });

    return {
      id: dataset.variantId,
      title: dataset.variantTitle,
      mediaId: dataset.variantMediaId || '',
      image: dataset.variantImage || '',
      options,
    };
  }

  #syncProductMedia(variantData) {
    const mediaId = String(variantData?.mediaId || '');
    if (!mediaId) return;

    const section = this.closest('.shopify-section, dialog') || document;
    const productMediaGallery = section.querySelector('product-media-gallery');
    if (productMediaGallery) {
      productMediaGallery.dataset.selectedMediaId = mediaId;
    }

    const mediaGallery = section.querySelector('product-media-gallery slider-component');
    if (!mediaGallery) return;

    const slides = Array.from(mediaGallery.querySelectorAll('[data-ref="main-slider"] .splide__slide'));
    const targetIndex = slides.findIndex((slide) => slide.dataset.mediaId === mediaId);

    if (targetIndex < 0 || !mediaGallery.slider || typeof mediaGallery.slider.go !== 'function') return;

    mediaGallery.slider.go(targetIndex);
  }

  #updateHiddenSelects(variantData) {
    if (!variantData) return;

    this.#hiddenSelects.forEach((select) => {
      const optionName = select.name.replace('option-', '');
      const selectedValue = variantData.options[`option${this.#getOptionIndex(optionName)}`];

      Array.from(select.options).forEach((option) => {
        const matches = option.value === selectedValue;
        option.selected = matches;
        if (matches) {
          option.setAttribute('selected', 'selected');
        } else {
          option.removeAttribute('selected');
        }
      });
    });
  }

  #getOptionIndex(optionName) {
    const normalized = optionName.toLowerCase();
    const optionList = Array.from(this.querySelectorAll('select[name^="option-"]')).map((select) =>
      select.name.replace('option-', '').toLowerCase(),
    );
    const index = optionList.indexOf(normalized);
    return index >= 0 ? index + 1 : 1;
  }

  #updatePreviewFromVariantData(variantData) {
    if (!this.#selectedVariantPreview || !variantData) return;
    const imageWrapper = this.#selectedVariantImage?.closest('.variant-picker__single-preview-image-wrapper');
    const plus = this.querySelector('[data-ref="selected-variant-plus"]');

    this.#selectedVariantTitle.textContent = variantData.title;
    this.#selectedVariantOptions.textContent = Object.values(variantData.options).filter(Boolean).join(' • ');

    if (variantData.image) {
      this.#selectedVariantImage.src = variantData.image;
      this.#selectedVariantImage.alt = variantData.title;
      imageWrapper?.classList.remove('visually-hidden');
    } else {
      this.#selectedVariantImage.removeAttribute('src');
      this.#selectedVariantImage.alt = '';
      imageWrapper?.classList.add('visually-hidden');
    }

    this.#selectedVariantPreview.classList.remove('variant-picker__single-preview--empty');
    plus?.classList.add('visually-hidden');
    this.querySelector('.variant-picker__single-add-button')?.classList.add('visually-hidden');
  }

  #updatePreviewFromCurrentSelection() {
    const currentVariantId = this.#hiddenVariantInput?.value;
    if (!currentVariantId) return;

    const selectedCard = Array.from(this.querySelectorAll('[data-action="select-variant"]')).find(
      (item) => item.dataset.variantId === currentVariantId,
    );

    if (selectedCard) {
      const variantData = this.#getVariantDataFromCard(selectedCard);
      this.#updatePreviewFromVariantData(variantData);
    }
  }

  // Met à jour l'option sélectionnée dans l'interface.
  updateSelectedOption(target) {
    // Si c'est une chaîne, trouve l'élément correspondant pour récupérer l'ID de la valeur d'option
    if (typeof target === 'string') {
      const targetElement = this.querySelector(`[data-option-value-id="${target}"]`);

      if (!targetElement) throw new Error('Target element not found');

      target = targetElement;
    }

    // Met à jour l'état "checked" pour les boutons radio
    if (target instanceof HTMLInputElement) {
      target.checked = true;
    }

    // Met à jour l'attribut "selected" pour les éléments select
    if (target instanceof HTMLSelectElement) {
      const newValue = target.value;
      const newSelectedOption = Array.from(target.options).find((option) => option.value === newValue);

      if (!newSelectedOption) throw new Error('Option not found');

      // Supprime l'attribut selected de toutes les options
      for (const option of target.options) {
        option.removeAttribute('selected');
      }

      // Ajoute l'attribut selected à la nouvelle option
      newSelectedOption.setAttribute('selected', 'selected');
    }
  }

  // Construit l'URL de requête pour récupérer les données de variante.
  buildRequestUrl() {
    let productUrl = this.dataset.productUrl;

    // On utilise la nouvelle API de Shopify pour récupérer les données de variante avec option_values.
    const params = [];
    params.push(`option_values=${this.selectedOptionsValues.join(',')}`);

    const variantId = this.#hiddenVariantInput?.value;
    if (variantId) {
      params.push(`variant=${variantId}`);
    }

    return `${productUrl}?${params.join('&')}`;
  }

  // Récupère la section mise à jour depuis le serveur.
  fetchUpdatedSection(requestUrl) {
    // Annule la requête fetch précédente si elle est encore en cours
    this.#abortController?.abort();
    this.#abortController = new AbortController();

    fetch(requestUrl, { signal: this.#abortController.signal })
      .then((response) => response.text())
      .then((responseText) => {
        const html = new DOMParser().parseFromString(responseText, 'text/html');

        // Récupère les données JSON de la variante depuis la réponse
        const textContent = html.querySelector(`variant-picker script[type="application/json"]`)?.textContent;
        if (!textContent) return;

        // Déclenche un événement pour notifier la mise à jour de la variante
        if (this.selectedOptionId) {
          this.dispatchEvent(
            new VariantUpdatedEvent(JSON.parse(textContent), this.selectedOptionId, {
              html,
              productId: this.dataset.productId ?? '',
            }),
          );
        }
      })
      .catch((error) => {
        if (error.name === 'AbortError') {
          console.log("Fetch interrompu par l'utilisateur");
        } else {
          console.error(error);
        }
      });
  }

  // Re-rend le sélecteur de variante avec les nouvelles données.
  updateVariantPicker(newHtml) {
    // Trouve le nouveau variant picker dans la réponse
    const newVariantPickerSource = newHtml.querySelector(this.tagName.toLowerCase());

    if (!newVariantPickerSource) {
      throw new Error('Aucune nouvelle source de variant picker trouvée');
    }

    // Met à jour le variant picker
    this.innerHTML = newVariantPickerSource.innerHTML;
    this.#bindElements();
    this.#updatePreviewFromCurrentSelection();
  }

  // Met à jour l'URL avec l'ID de variante sur les pages produit
  updateUrl(target) {
    // Détermine si nous sommes sur une page produit (pas dans une carte produit ou dialogue)
    const isOnProductPage =
      Theme.template.name === 'product' &&
      !target.closest('product-card') &&
      !target.closest('quick-add-dialog');

    if (!isOnProductPage) {
      return;
    }

    // Prépare l'URL pour la mise à jour de l'historique du navigateur
    this.normalizeProductUrl();
  }

  // Récupère l'option actuellement sélectionnée.
  get selectedOption() {
    const selectedOption = this.querySelector('select option[selected], fieldset input:checked');

    if (!(selectedOption instanceof HTMLInputElement || selectedOption instanceof HTMLOptionElement)) {
      return undefined;
    }

    return selectedOption;
  }

  // Récupère l'ID de l'option actuellement sélectionnée.
  get selectedOptionId() {
    const { selectedOption } = this;
    if (!selectedOption) return undefined;
    const { optionValueId } = selectedOption.dataset;

    if (!optionValueId) {
      throw new Error("Aucun ID de valeur d'option trouvé");
    }

    return optionValueId;
  }

  // Récupère toutes les valeurs d'options actuellement sélectionnées.
  get selectedOptionsValues() {
    const selectedOptions = Array.from(this.querySelectorAll('select option[selected], fieldset input:checked'));

    return selectedOptions.map((option) => {
      const { optionValueId } = option.dataset;

      if (!optionValueId) throw new Error("Aucun ID de valeur d'option trouvé");

      return optionValueId;
    });
  }
}

if (!customElements.get('variant-picker')) {
  customElements.define('variant-picker', VariantPicker);
}
