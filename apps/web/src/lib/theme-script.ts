/**
 * Runs in <head> before first paint (see app/layout.tsx): applies the saved theme so a dark-mode
 * user never sees a white flash. With nothing saved the app is light; following the device
 * ("system") is something the user opts into. Kept free of React so the server
 * layout can import it.
 */
export const THEME_STORAGE_KEY = "compass.theme";

export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
