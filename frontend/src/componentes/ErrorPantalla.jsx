// Si una pantalla falla al dibujarse, en vez de quedar en blanco se muestra este aviso.
// (En React, atrapar errores de dibujo requiere un componente de clase: es la unica forma.)
import { Component } from "react";

export default class ErrorPantalla extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("Error al dibujar la pantalla:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
        <p className="titular text-5xl">Algo falló en esta pantalla</p>
        <p className="mt-3 text-tinta-suave">Recarga la página. Si sigue pasando, vuelve al inicio.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-10 rounded-pieza bg-acento px-4 font-semibold text-acento-tinta"
          >
            Recargar
          </button>
          <a href="/" className="inline-flex h-10 items-center rounded-pieza border border-linea-fuerte px-4">
            Ir al inicio
          </a>
        </div>
      </section>
    );
  }
}
