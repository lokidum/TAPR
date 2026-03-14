import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';

class LevelUpCelebration extends StatefulWidget {
  const LevelUpCelebration({
    super.key,
    required this.level,
    this.title,
    required this.onDismiss,
  });

  final int level;
  final String? title;
  final VoidCallback onDismiss;

  @override
  State<LevelUpCelebration> createState() => _LevelUpCelebrationState();
}

class _LevelUpCelebrationState extends State<LevelUpCelebration>
    with TickerProviderStateMixin {
  late final AnimationController _particleController;
  late final AnimationController _textController;
  late final Animation<double> _textScale;
  late final Animation<double> _textOpacity;
  late final List<_Particle> _particles;
  final _random = Random();

  @override
  void initState() {
    super.initState();

    _particleController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2500),
    );

    _textController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );

    _textScale = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0.3, end: 1.15), weight: 60),
      TweenSequenceItem(tween: Tween(begin: 1.15, end: 1.0), weight: 40),
    ]).animate(CurvedAnimation(
      parent: _textController,
      curve: Curves.easeOut,
    ));

    _textOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _textController,
        curve: const Interval(0.0, 0.4),
      ),
    );

    _particles = List.generate(30, (_) => _Particle.random(_random));

    _triggerHaptics();
    _particleController.forward();

    Future.delayed(const Duration(milliseconds: 300), () {
      if (mounted) _textController.forward();
    });

    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) widget.onDismiss();
    });
  }

  Future<void> _triggerHaptics() async {
    await HapticFeedback.mediumImpact();
    await Future.delayed(const Duration(milliseconds: 150));
    await HapticFeedback.mediumImpact();
    await Future.delayed(const Duration(milliseconds: 150));
    await HapticFeedback.mediumImpact();
  }

  @override
  void dispose() {
    _particleController.dispose();
    _textController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;

    return GestureDetector(
      onTap: widget.onDismiss,
      child: Material(
        color: Colors.black.withValues(alpha: 0.85),
        child: SizedBox.expand(
          child: Stack(
            alignment: Alignment.center,
            children: [
              AnimatedBuilder(
                animation: _particleController,
                builder: (context, _) {
                  return CustomPaint(
                    size: size,
                    painter: _ParticlePainter(
                      particles: _particles,
                      progress: _particleController.value,
                    ),
                  );
                },
              ),
              AnimatedBuilder(
                animation: _textController,
                builder: (context, child) {
                  return Opacity(
                    opacity: _textOpacity.value,
                    child: Transform.scale(
                      scale: _textScale.value,
                      child: child,
                    ),
                  );
                },
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 90,
                      height: 90,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(
                          colors: [
                            AppColors.gold,
                            AppColors.gold.withValues(alpha: 0.6),
                          ],
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.gold.withValues(alpha: 0.4),
                            blurRadius: 40,
                            spreadRadius: 10,
                          ),
                        ],
                      ),
                      child: Center(
                        child: Text(
                          '${widget.level}',
                          style: AppTextStyles.h1.copyWith(
                            fontSize: 40,
                            color: AppColors.white,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    Text(
                      'Level ${widget.level} Unlocked!',
                      style: AppTextStyles.h1.copyWith(
                        color: AppColors.gold,
                        fontSize: 32,
                      ),
                    ),
                    if (widget.title != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        widget.title!,
                        style: AppTextStyles.h2.copyWith(
                          color: AppColors.white,
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    Text(
                      'Tap to continue',
                      style: AppTextStyles.caption,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Particle {
  final double angle;
  final double speed;
  final double size;
  final double startDelay;
  final Color color;

  _Particle({
    required this.angle,
    required this.speed,
    required this.size,
    required this.startDelay,
    required this.color,
  });

  factory _Particle.random(Random random) {
    final goldVariants = [
      AppColors.gold,
      AppColors.gold.withValues(alpha: 0.8),
      AppColors.goldMuted,
      AppColors.white.withValues(alpha: 0.6),
    ];
    return _Particle(
      angle: random.nextDouble() * 2 * pi,
      speed: 0.5 + random.nextDouble() * 1.5,
      size: 3 + random.nextDouble() * 6,
      startDelay: random.nextDouble() * 0.3,
      color: goldVariants[random.nextInt(goldVariants.length)],
    );
  }
}

class _ParticlePainter extends CustomPainter {
  final List<_Particle> particles;
  final double progress;

  _ParticlePainter({required this.particles, required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);

    for (final p in particles) {
      final adjustedProgress =
          ((progress - p.startDelay) / (1 - p.startDelay)).clamp(0.0, 1.0);
      if (adjustedProgress <= 0) continue;

      final distance = adjustedProgress * p.speed * size.width * 0.4;
      final dx = center.dx + cos(p.angle) * distance;
      final dy = center.dy + sin(p.angle) * distance;
      final opacity = (1.0 - adjustedProgress).clamp(0.0, 1.0);

      final paint = Paint()
        ..color = p.color.withValues(alpha: opacity * p.color.a / 255)
        ..style = PaintingStyle.fill;

      canvas.drawCircle(
        Offset(dx, dy),
        p.size * (1 - adjustedProgress * 0.5),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_ParticlePainter oldDelegate) =>
      oldDelegate.progress != progress;
}
