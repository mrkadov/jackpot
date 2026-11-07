/* Jackpot site interactions */
(function () {
  const nav = document.querySelector(".menu_head");
  const toggle = document.querySelector(".nav-toggle");
  if (toggle && nav) {
    toggle.addEventListener("click", () => nav.classList.toggle("open"));
  }

  // Accordion
  document.querySelectorAll(".accordion .item").forEach((item) => {
    const btn = item.querySelector("button");
    const panel = item.querySelector(".panel");
    if (!btn || !panel) return;
    btn.addEventListener("click", () => {
      const open = panel.classList.contains("open");
      document.querySelectorAll(".accordion .panel").forEach((p) => p.classList.remove("open"));
      if (!open) panel.classList.add("open");
    });
  });

  // Reveal on scroll
  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("visible"));
  }

  // Back to top
  const toTop = document.querySelector(".to-top");
  if (toTop) {
    window.addEventListener("scroll", () => {
      toTop.classList.toggle("show", window.scrollY > 500);
    });
    toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  // Simple starfield canvas (no external lib)
  const host = document.getElementById("particles-js");
  if (host) {
    const canvas = document.createElement("canvas");
    canvas.className = "particles-js-canvas-el";
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
    host.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    let stars = [];
    let w = 0;
    let h = 0;
    let raf;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = Math.max(window.innerHeight, document.body.scrollHeight);
      const count = Math.min(160, Math.floor((w * h) / 14000));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.6 + 0.3,
        a: Math.random() * 0.7 + 0.2,
        s: Math.random() * 0.25 + 0.05,
      }));
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (const st of stars) {
        st.y += st.s;
        if (st.y > h) st.y = 0;
        ctx.beginPath();
        ctx.fillStyle = `rgba(200, 180, 255, ${st.a})`;
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    }

    resize();
    draw();
    window.addEventListener("resize", () => {
      cancelAnimationFrame(raf);
      resize();
      draw();
    });
  }

  // Newsletter-only demo handler
  document.querySelectorAll("form.pay_form").forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const original = btn ? btn.textContent : "";
      if (btn) btn.textContent = "✓";
      setTimeout(() => {
        if (btn) btn.textContent = original;
        form.reset();
      }, 1200);
    });
  });
})();
