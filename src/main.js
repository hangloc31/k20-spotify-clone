const CARD_WIDTH = 178;
const CARD_GAP = 16;

const sectionGroups = document.querySelectorAll(".section-group");

sectionGroups.forEach((section) => {
  const grid = section.querySelector(".card-grid");
  const prevBtn = section.querySelector('.carousel-nav[aria-label="Previous"]');
  const nextBtn = section.querySelector('.carousel-nav[aria-label="Next"]');
  if (!grid || !prevBtn || !nextBtn) return;

  const updateButtons = () => {
    const { scrollLeft, scrollWidth, clientWidth } = grid;
    prevBtn.disabled = scrollLeft <= 0;
    nextBtn.disabled = scrollLeft >= scrollWidth - clientWidth - 1;
  };

  prevBtn.addEventListener("click", () => {
    grid.scrollBy({ left: -(CARD_WIDTH + CARD_GAP), behavior: "smooth" });
  });

  nextBtn.addEventListener("click", () => {
    grid.scrollBy({ left: CARD_WIDTH + CARD_GAP, behavior: "smooth" });
  });

  grid.addEventListener("scroll", updateButtons, { passive: true });
  window.addEventListener("resize", updateButtons);
  updateButtons();
});
