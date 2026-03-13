import 'package:flutter/material.dart';
import 'package:tapr/shared/widgets/placeholder_screen.dart';

class BarberPublicProfileScreen extends StatelessWidget {
  const BarberPublicProfileScreen({super.key, required this.barberId});

  final String barberId;

  @override
  Widget build(BuildContext context) {
    return PlaceholderScreen(title: 'Barber: $barberId');
  }
}
