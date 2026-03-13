import 'package:flutter/material.dart';

enum ScreenSize { compact, medium, expanded }

class ResponsiveBuilder extends StatelessWidget {
  const ResponsiveBuilder({
    super.key,
    required this.compact,
    this.medium,
    this.expanded,
  });

  final Widget compact;
  final Widget? medium;
  final Widget? expanded;

  static ScreenSize screenSize(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    if (width >= 840) return ScreenSize.expanded;
    if (width >= 600) return ScreenSize.medium;
    return ScreenSize.compact;
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth >= 840) {
          return expanded ?? medium ?? compact;
        }
        if (constraints.maxWidth >= 600) {
          return medium ?? compact;
        }
        return compact;
      },
    );
  }
}
