import 'package:flutter/material.dart';
import 'package:tapr/shared/widgets/placeholder_screen.dart';

class StudioPublicProfileScreen extends StatelessWidget {
  const StudioPublicProfileScreen({super.key, required this.studioId});

  final String studioId;

  @override
  Widget build(BuildContext context) {
    return PlaceholderScreen(title: 'Studio: $studioId');
  }
}
