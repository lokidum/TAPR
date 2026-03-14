import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/auth/presentation/auth_controller.dart';
import 'package:tapr/shared/utils/snackbar_utils.dart';

class WelcomeScreen extends ConsumerWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authControllerProvider);

    ref.listen<AuthScreenState>(authControllerProvider, (prev, next) {
      if (next.error != null && prev?.error != next.error) {
        showErrorSnackBar(context, next.error!);
        ref.read(authControllerProvider.notifier).clearError();
      }
    });

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          child: Column(
            children: [
              const Spacer(flex: 2),
              _Logo(),
              const SizedBox(height: 24),
              Text('TAPR', style: AppTextStyles.h1),
              const SizedBox(height: 8),
              Text(
                'Your chair. Your clients. Your level.',
                style: AppTextStyles.bodySecondary,
                textAlign: TextAlign.center,
              ),
              const Spacer(flex: 3),
              if (Platform.isIOS) ...[
                _SocialButton(
                  label: 'Continue with Apple',
                  icon: Icons.apple,
                  backgroundColor: Colors.black,
                  textColor: AppColors.white,
                  isLoading: authState.isLoading,
                  onPressed: () {
                    ref
                        .read(authControllerProvider.notifier)
                        .signInWithApple();
                  },
                ),
                const SizedBox(height: 12),
              ],
              _SocialButton(
                label: 'Continue with Google',
                icon: null,
                backgroundColor: AppColors.white,
                textColor: const Color(0xFF1A1A1A),
                isLoading: authState.isLoading,
                onPressed: () {
                  ref
                      .read(authControllerProvider.notifier)
                      .signInWithGoogle();
                },
                customIcon: _GoogleIcon(),
              ),
              const SizedBox(height: 20),
              _OrDivider(),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: OutlinedButton(
                  onPressed:
                      authState.isLoading ? null : () => context.push('/auth/phone'),
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: AppColors.gold),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: Text(
                    'Continue with Phone',
                    style: AppTextStyles.body.copyWith(color: AppColors.gold),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'By continuing you agree to our Terms',
                style: AppTextStyles.caption,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }
}

class _Logo extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 80,
      height: 80,
      decoration: BoxDecoration(
        color: AppColors.gold,
        borderRadius: BorderRadius.circular(20),
      ),
      child: const Icon(
        Icons.content_cut_rounded,
        color: AppColors.white,
        size: 40,
      ),
    );
  }
}

class _SocialButton extends StatelessWidget {
  const _SocialButton({
    required this.label,
    required this.icon,
    required this.backgroundColor,
    required this.textColor,
    required this.isLoading,
    required this.onPressed,
    this.customIcon,
  });

  final String label;
  final IconData? icon;
  final Color backgroundColor;
  final Color textColor;
  final bool isLoading;
  final VoidCallback onPressed;
  final Widget? customIcon;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton(
        onPressed: isLoading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: backgroundColor,
          foregroundColor: textColor,
          disabledBackgroundColor: backgroundColor.withValues(alpha: 0.6),
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        child: isLoading
            ? SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  valueColor: AlwaysStoppedAnimation<Color>(textColor),
                ),
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (customIcon != null) ...[
                    customIcon!,
                    const SizedBox(width: 10),
                  ] else if (icon != null) ...[
                    Icon(icon, size: 22),
                    const SizedBox(width: 10),
                  ],
                  Text(
                    label,
                    style: AppTextStyles.body.copyWith(
                      color: textColor,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

class _GoogleIcon extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 20,
      height: 20,
      child: CustomPaint(painter: _GoogleLogoPainter()),
    );
  }
}

class _GoogleLogoPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final double w = size.width;
    final double h = size.height;

    final blue = Paint()..color = const Color(0xFF4285F4);
    final red = Paint()..color = const Color(0xFFEA4335);
    final yellow = Paint()..color = const Color(0xFFFBBC05);
    final green = Paint()..color = const Color(0xFF34A853);

    final center = Offset(w / 2, h / 2);
    final radius = w / 2;

    final path = Path()
      ..moveTo(center.dx + radius, center.dy)
      ..arcToPoint(
        Offset(center.dx, center.dy - radius),
        radius: Radius.circular(radius),
      );
    canvas.drawPath(path, blue);

    final path2 = Path()
      ..moveTo(center.dx, center.dy - radius)
      ..arcToPoint(
        Offset(center.dx - radius, center.dy),
        radius: Radius.circular(radius),
      );
    canvas.drawPath(path2, red);

    final path3 = Path()
      ..moveTo(center.dx - radius, center.dy)
      ..arcToPoint(
        Offset(center.dx, center.dy + radius),
        radius: Radius.circular(radius),
      );
    canvas.drawPath(path3, yellow);

    final path4 = Path()
      ..moveTo(center.dx, center.dy + radius)
      ..arcToPoint(
        Offset(center.dx + radius, center.dy),
        radius: Radius.circular(radius),
      );
    canvas.drawPath(path4, green);

    canvas.drawCircle(center, radius * 0.55, Paint()..color = Colors.white);

    canvas.drawRect(
      Rect.fromLTRB(center.dx, center.dy - h * 0.12, w, center.dy + h * 0.12),
      blue,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _OrDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Expanded(child: Divider(color: AppColors.divider)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Text('or', style: AppTextStyles.caption),
        ),
        const Expanded(child: Divider(color: AppColors.divider)),
      ],
    );
  }
}
