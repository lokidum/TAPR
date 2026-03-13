import 'package:flutter/material.dart';
import 'package:tapr/core/theme/app_text_styles.dart';

class PlaceholderScreen extends StatelessWidget {
  const PlaceholderScreen({super.key, required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(title, style: AppTextStyles.h2),
            const SizedBox(height: 8),
            Text('Coming soon', style: AppTextStyles.bodySecondary),
          ],
        ),
      ),
    );
  }
}
