// NutriPerso — design tokens (refonte B v4). Source : Refonte B v4 - Palette 2.dc.html
import 'package:flutter/material.dart';

@immutable
class DomainColors {
  const DomainColors({
    required this.fill,
    required this.soft,
    required this.seg,
    required this.light,
    required this.textOnLight,
    required this.textOnFill,
  });

  /// Couleur pleine : boutons, anneaux, tuiles "filled".
  final Color fill;

  /// Fond de tuile / carte teintée.
  final Color soft;

  /// Piste de barre, fond de segmenté.
  final Color seg;

  /// Barres secondaires, graphiques.
  final Color light;

  /// Texte et icônes posés sur fond clair (soft, card, screen).
  final Color textOnLight;

  /// Texte et icônes posés sur [fill].
  final Color textOnFill;
}

abstract final class NutriDomains {
  static const nutrition = DomainColors(
    fill: Color(0xFF36B37E),
    soft: Color(0xFFDDF3E9),
    seg: Color(0xFFBDE7D3),
    light: Color(0xFF86D2AF),
    textOnLight: Color(0xFF1F7A52),
    textOnFill: Color(0xFF0B3B26),
  );
  static const kitchen = DomainColors(
    fill: Color(0xFFF7A007),
    soft: Color(0xFFFDEBCC),
    seg: Color(0xFFFBD89A),
    light: Color(0xFFF9C25E),
    textOnLight: Color(0xFF945B00),
    textOnFill: Color(0xFF3A2600),
  );
  static const training = DomainColors(
    fill: Color(0xFF262E57),
    soft: Color(0xFFDDE0EE),
    seg: Color(0xFFC2C7E0),
    light: Color(0xFF8E96C0),
    textOnLight: Color(0xFF262E57),
    textOnFill: Color(0xFFFFFFFF),
  );
  static const body = DomainColors(
    fill: Color(0xFF7C5CFC),
    soft: Color(0xFFEAE5FF),
    seg: Color(0xFFD6CCFE),
    light: Color(0xFFB3A2FD),
    textOnLight: Color(0xFF5A3BD6),
    textOnFill: Color(0xFFFFFFFF),
  );
  static const community = DomainColors(
    fill: Color(0xFFA5E9E8),
    soft: Color(0xFFE3F8F7),
    seg: Color(0xFFC8F1F0),
    light: Color(0xFFA5E9E8),
    textOnLight: Color(0xFF1C6968),
    textOnFill: Color(0xFF0E4D4C),
  );

  /// Contours, anneaux d'avatar, pointillés Communauté.
  static const communityRing = Color(0xFF4FBFBE);
}

@immutable
class MacroColors {
  const MacroColors(this.fill, this.track, this.text);
  final Color fill;
  final Color track;
  final Color text;
}

abstract final class NutriMacros {
  static const protein = MacroColors(Color(0xFFC32B42), Color(0xFFF8DDE1), Color(0xFF9E2236));
  static const carbs = MacroColors(Color(0xFFF7A007), Color(0xFFFDEBCC), Color(0xFF945B00));
  static const fat = MacroColors(Color(0xFF4FBFBE), Color(0xFFE3F8F7), Color(0xFF1C6968));
}

abstract final class NutriNeutrals {
  static const ink = Color(0xFF231F1A);
  static const muted = Color(0xFF736B62);
  static const faint = Color(0xFFA39A8F);
  static const tabInactive = Color(0xFF8A8279);
  static const screen = Color(0xFFF4F1EB);
  static const card = Color(0xFFFFFDF9);
  static const cardBorder = Color(0xFFE9E3D9);
  static const divider = Color(0xFFEEE8DE);
  static const track = Color(0xFFEBE5DA);
  static const chip = Color(0xFFF1ECE4);
  static const sheetHandle = Color(0xFFE0D9CE);
  static const tabBarBorder = Color(0xFFE6E0D6);
  static const scrim = Color(0x801C1814); // rgba(28,24,20,0.5)
  static const workoutDark = Color(0xFF1C1915);
  static const recordBg = Color(0xFFFDEBCC);
  static const recordText = Color(0xFF945B00);
}

abstract final class NutriRadius {
  static const sheet = 28.0;
  static const sessionCard = 20.0;
  static const card = 18.0;
  static const tile = 16.0;
  static const field = 14.0;
  static const domainBadge = 11.0;
  static const small = 10.0;
  static const pill = 999.0;
}

abstract final class NutriSpace {
  static const screenH = 16.0;
  static const onboardingH = 22.0;
  static const block = 12.0;
  static const cardPad = 14.0;
  static const cardPadLg = 16.0;
  static const tileGap = 10.0;
  static const tileGapSm = 8.0;
  static const tabBarHeight = 58.0;
}

abstract final class NutriType {
  static const family = 'Instrument Sans';
  static const _tab = [FontFeature.tabularFigures()];

  static TextStyle _s(double size, FontWeight w, {double? height, double ls = 0, Color c = NutriNeutrals.ink}) =>
      TextStyle(fontFamily: family, fontSize: size, fontWeight: w, height: height, letterSpacing: ls * size, color: c, fontFeatures: _tab);

  static final screenTitle = _s(24, FontWeight.w600, height: 1.2, ls: -0.03);
  static final onboardingTitle = _s(28, FontWeight.w600, height: 1.15, ls: -0.03);
  static final ringValue = _s(26, FontWeight.w700, height: 1.0, ls: -0.03);
  static final bigNumber = _s(52, FontWeight.w700, height: 1.0, ls: -0.04);
  static final cardTitle = _s(15, FontWeight.w600);
  static final body = _s(14, FontWeight.w400, height: 1.45);
  static final bodyStrong = _s(14, FontWeight.w500, height: 1.45);
  static final secondary = _s(12.5, FontWeight.w400, c: NutriNeutrals.muted);
  static final tileLabel = _s(11.5, FontWeight.w600);
  static final sectionCaps = _s(11.5, FontWeight.w700, ls: 0.06);
  static final sheetTitle = _s(19, FontWeight.w600, ls: -0.02);
  static final tab = _s(10.5, FontWeight.w500, c: NutriNeutrals.tabInactive);
  static final tabActive = _s(10.5, FontWeight.w700);
}

abstract final class NutriMotion {
  /// Rebond des bulles du bouton +, toasts.
  static const spring = Cubic(.34, 1.56, .64, 1);

  /// Entrée des feuilles.
  static const sheet = Cubic(.2, .9, .3, 1);
  static const bubbles = Duration(milliseconds: 380);
  static const bubbleStagger = Duration(milliseconds: 40);
  static const sheetIn = Duration(milliseconds: 350);
  static const scrim = Duration(milliseconds: 250);
  static const fabRotate = Duration(milliseconds: 300);
  static const longPress = Duration(milliseconds: 500);
  static const toastHold = Duration(milliseconds: 2200);

  /// Positions des bulles par rapport au centre du +.
  static const seanceOffset = Offset(-92, -78);
  static const repasOffset = Offset(0, -128);
  static const peseeOffset = Offset(92, -78);
  static const bubbleSize = 54.0;
  static const bubbleSizeMain = 66.0;
  static const fabSize = 50.0;
}
