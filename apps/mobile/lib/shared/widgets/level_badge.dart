import 'package:flutter/material.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';

class LevelBadge extends StatelessWidget {
  const LevelBadge({
    super.key,
    required this.level,
    this.title,
  });

  final int level;
  final String? title;

  @override
  Widget build(BuildContext context) {
    final text = title != null ? 'Lv.$level $title' : 'Lv.$level';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.gold.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(100),
        border: Border.all(
          color: AppColors.gold.withValues(alpha: 0.3),
        ),
      ),
      child: Text(
        text.toUpperCase(),
        style: AppTextStyles.label,
      ),
    );
  }
}
