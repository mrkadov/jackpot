(function () {
  const { api, setAuth } = window.JackpotAPI;

  function validateTCKN(value) {
    const tc = String(value || "").trim();
    if (!/^[1-9][0-9]{10}$/.test(tc)) return false;
    const d = tc.split("").map(Number);
    const odd = d[0] + d[2] + d[4] + d[6] + d[8];
    const even = d[1] + d[3] + d[5] + d[7];
    if ((odd * 7 - even) % 10 !== d[9]) return false;
    return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
  }

  function fillCities() {
    const city = document.getElementById("city");
    const district = document.getElementById("district");
    if (!city || !window.TURKEY_LOCATIONS) return;

    const cities = Object.keys(window.TURKEY_LOCATIONS).sort((a, b) =>
      a.localeCompare(b, "tr")
    );
    city.innerHTML =
      '<option value="">İl seçiniz</option>' +
      cities.map((c) => `<option value="${c}">${c}</option>`).join("");

    city.addEventListener("change", () => {
      const list = window.TURKEY_LOCATIONS[city.value] || [];
      district.disabled = !list.length;
      district.innerHTML =
        '<option value="">İlçe seçiniz</option>' +
        list.map((d) => `<option value="${d}">${d}</option>`).join("");
    });
  }

  fillCities();

  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = document.getElementById("formError");
      err.textContent = "";
      try {
        const data = await api("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: document.getElementById("email").value,
            password: document.getElementById("password").value,
          }),
        });
        setAuth(data.token, data.user);
        window.location.href = data.user.role === "ADMIN" ? "admin/index.html" : "hesabim.html";
      } catch (ex) {
        err.textContent = ex.message;
      }
    });
  }

  const signupForm = document.getElementById("signupForm");
  if (signupForm) {
    const tcInput = document.getElementById("tcKimlik");
    if (tcInput) {
      tcInput.addEventListener("input", () => {
        tcInput.value = tcInput.value.replace(/\D/g, "").slice(0, 11);
      });
    }

    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = document.getElementById("formError");
      err.textContent = "";

      const fp =
        localStorage.getItem("jackpot_fp") ||
        (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
      localStorage.setItem("jackpot_fp", fp);
      const ref = new URLSearchParams(location.search).get("ref") || undefined;

      const payload = {
        firstName: document.getElementById("firstName").value.trim(),
        lastName: document.getElementById("lastName").value.trim(),
        tcKimlik: document.getElementById("tcKimlik").value.trim(),
        birthDate: document.getElementById("birthDate").value,
        gender: document.getElementById("gender").value,
        phone: document.getElementById("phone").value.trim(),
        email: document.getElementById("email").value.trim(),
        password: document.getElementById("password").value,
        passwordConfirm: document.getElementById("passwordConfirm").value,
        city: document.getElementById("city").value,
        district: document.getElementById("district").value,
        postalCode: document.getElementById("postalCode").value.trim(),
        address: document.getElementById("address").value.trim(),
        acceptTerms: document.getElementById("acceptTerms").checked,
        deviceFingerprint: fp,
        ref,
      };

      if (!validateTCKN(payload.tcKimlik)) {
        err.textContent = "Geçerli bir TC Kimlik No girin";
        return;
      }
      if (payload.password !== payload.passwordConfirm) {
        err.textContent = "Şifreler eşleşmiyor";
        return;
      }

      try {
        const data = await api("/auth/register", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setAuth(data.token, data.user);
        window.location.href = "hesabim.html";
      } catch (ex) {
        err.textContent = ex.message;
      }
    });
  }
})();
