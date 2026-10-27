/* ============================================================
   AgriCare AI — shared site behaviour
   Navbar, footer year, FAQ accordion, animated counters,
   scroll reveal, crop selector and contact form.
   ============================================================ */

(function () {
  'use strict';

  /* ---------- Mobile navbar ---------- */
  var navToggle = document.getElementById('navToggle');
  var navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      navLinks.classList.toggle('open');
    });
  }

  /* ---------- Footer year ---------- */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- FAQ accordion ---------- */
  document.querySelectorAll('.faq-q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.faq-item');
      var wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(function (el) {
        el.classList.remove('open');
        el.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
      });
      if (!wasOpen) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* ---------- Animated counters ---------- */
  function animateCount(el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    var suffix = el.getAttribute('data-suffix') || '';
    var duration = 1200;
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      el.textContent = Math.round(target * p) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  var counters = document.querySelectorAll('.stat-num[data-count]');
  if ('IntersectionObserver' in window) {
    var counterObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          animateCount(e.target);
          counterObs.unobserve(e.target);
        }
      });
    }, { threshold: 0.5 });
    counters.forEach(function (c) { counterObs.observe(c); });
  } else {
    counters.forEach(function (c) { c.textContent = c.getAttribute('data-count') + ''; });
  }

  /* ---------- Scroll reveal ----------
     Only elements that start BELOW the fold are hidden and faded in.
     Anything already on screen is left visible, so the page never
     flashes or shifts while it first paints. */
  var revealTargets = document.querySelectorAll('.section-head, .feature-card, .step, .g-card, .testi-card, .tip-card, .obj-card, .lit-card, .tl-item, .tech-item, .info-card, .stat-card');
  if ('IntersectionObserver' in window) {
    var revealObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          revealObs.unobserve(e.target);
        }
      });
    }, { threshold: 0.08 });
    Array.prototype.forEach.call(revealTargets, function (el) {
      var box = el.getBoundingClientRect();
      if (box.top > window.innerHeight) {   // below the fold -> animate in
        el.classList.add('reveal');
        revealObs.observe(el);
      } else {                              // on screen -> show immediately
        el.classList.add('visible');
      }
    });
    setTimeout(function () {
      Array.prototype.forEach.call(revealTargets, function (el) { el.classList.add('visible'); });
    }, 2500);
  } else {
    Array.prototype.forEach.call(revealTargets, function (el) { el.classList.add('visible'); });
  }

  /* ---------- Crop selector (home) ---------- */
  var CROP_DATA = {
    tomato: { emoji: '🍅', title: 'Tomato', desc: '10 classes including Leaf Mold, Bacterial Spot, Yellow Leaf Curl Virus, Early Blight, Late Blight, Septoria Leaf Spot and healthy leaves.', img: 'assets/images/tomato_healthy.png' },
    potato: { emoji: '🥔', title: 'Potato', desc: '3 classes — Early Blight, Late Blight and Healthy — the classic model species for leaf-disease research.', img: 'assets/images/potato_healthy.png' },
    corn: { emoji: '🌽', title: 'Corn (Maize)', desc: '4 classes — Common Rust, Gray Leaf Spot, Northern Leaf Blight and Healthy.', img: 'assets/images/corn_healthy.png' },
    rice: { emoji: '🌾', title: 'Rice', desc: 'Blast, Brown Spot, Leaf Smut and Healthy — vital for Indian food security.', img: 'assets/images/rice_healthy.png' },
    brinjal: { emoji: '🍆', title: 'Brinjal (Eggplant)', desc: 'Fruit Rot (Phomopsis), Little Leaf and Healthy classes for warm-season growers.', img: 'assets/images/brinjal_healthy.png' },
    pepper: { emoji: '🌶️', title: 'Bell Pepper', desc: 'Bacterial Spot and healthy — a greenhouse export crop with high value.', img: 'assets/images/tomato_healthy.png' },
    grape: { emoji: '🍇', title: 'Grape', desc: 'Black Rot, Esca (Black Measles), Leaf Blight and healthy vines.', img: 'assets/images/tomato_healthy.png' },
    apple: { emoji: '🍎', title: 'Apple', desc: 'Apple Scab, Black Rot, Cedar Apple Rust and healthy — the northern-hill crops.', img: 'assets/images/tomato_healthy.png' },
    citrus: { emoji: '🍊', title: 'Citrus', desc: 'Greening (HLB), Bacterial Spot and Vitamin C rich healthy trees.', img: 'assets/images/tomato_healthy.png' }
  };

  var chips = document.querySelectorAll('.crop-chip');
  var cropTitle = document.getElementById('cropTitle');
  var cropDesc = document.getElementById('cropDesc');
  var cropImg = document.getElementById('cropImg');
  if (chips.length && cropTitle) {
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        chips.forEach(function (c) { c.classList.remove('active'); });
        chip.classList.add('active');
        var data = CROP_DATA[chip.getAttribute('data-crop')];
        if (!data) return;
        cropTitle.textContent = data.title + ' ' + data.emoji;
        cropDesc.textContent = data.desc;
        cropImg.src = data.img;
        cropImg.alt = data.title + ' leaf';
      });
    });
  }

  /* ---------- Contact form ---------- */
  var contactForm = document.getElementById('contactForm');
  var formStatus = document.getElementById('formStatus');
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!contactForm.checkValidity()) {
        contactForm.reportValidity();
        return;
      }
      var data = new FormData(contactForm);
      fetch('/api/contact', { method: 'POST', body: data })
        .then(function (res) { return res.json(); })
        .then(function (json) {
          if (json && json.status === 'ok') {
            formStatus.textContent = '✅ Message sent — thank you!';
            formStatus.className = 'form-status ok';
            contactForm.reset();
          } else {
            throw new Error('bad response');
          }
        })
        .catch(function () {
          // static mode (no backend): simulate success
          formStatus.textContent = '✅ Message recorded (demo mode — start the Flask server for email delivery).';
          formStatus.className = 'form-status ok';
          contactForm.reset();
        });
    });
  }
})();