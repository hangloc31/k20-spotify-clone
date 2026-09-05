//Carousel button
const CARD_WIDTH = 178;
const CARD_GAP = 16;

const initialized = new WeakSet();

export function initCarousels() {
  const sectionGroups = document.querySelectorAll(".section-group");

  sectionGroups.forEach((section) => {
    if (initialized.has(section)) return;

    const grid = section.querySelector(".card-grid");
    const prevBtn = section.querySelector(".carousel-nav--prev");
    const nextBtn = section.querySelector(".carousel-nav--next");
    if (!grid || !prevBtn || !nextBtn) return;

    initialized.add(section);

    const updateButtons = () => {
      const { scrollLeft, scrollWidth, clientWidth } = grid;
      prevBtn.disabled = scrollLeft <= 0;
      nextBtn.disabled = Math.ceil(scrollLeft) >= scrollWidth - clientWidth - 1;
    };

    prevBtn.addEventListener("click", () => {
      grid.scrollBy({ left: -(CARD_WIDTH + CARD_GAP), behavior: "smooth" });
    });

    nextBtn.addEventListener("click", () => {
      grid.scrollBy({ left: CARD_WIDTH + CARD_GAP, behavior: "smooth" });
    });

    grid.addEventListener("wheel", updateButtons, { passive: true });
    grid.addEventListener("scroll", updateButtons, { passive: true });
    window.addEventListener("resize", updateButtons);
    requestAnimationFrame(updateButtons);
  });
}
