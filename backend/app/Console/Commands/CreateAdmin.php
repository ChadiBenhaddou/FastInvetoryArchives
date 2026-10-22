<?php

namespace App\Console\Commands;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

#[Signature('archive:create-admin {--username=admin} {--name=Administrateur} {--password= : Avoid on shared terminals; prompted when omitted}')]
#[Description('Create (or reset the password of) a desktop administrator')]
class CreateAdmin extends Command
{
    public function handle(): int
    {
        $username = $this->option('username');
        $password = $this->option('password');

        if ($password === null) {
            $password = $this->secret("Mot de passe pour « {$username} » (8 caractères minimum)");
            if ($password !== $this->secret('Confirmer le mot de passe')) {
                $this->error('Les mots de passe ne correspondent pas.');

                return self::FAILURE;
            }
        }

        $validator = Validator::make(
            ['username' => $username, 'password' => $password],
            ['username' => ['required', 'alpha_dash', 'max:50'], 'password' => ['required', Password::min(8)]],
        );
        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        $user = User::firstOrNew(['username' => $username]);
        $existed = $user->exists;
        $user->fill([
            'name' => $user->name ?? $this->option('name'),
            'password' => $password,
            'role' => UserRole::Admin,
            'is_active' => true,
        ])->save();

        $this->info($existed
            ? "Administrateur « {$username} » mis à jour (mot de passe réinitialisé)."
            : "Administrateur « {$username} » créé.");

        return self::SUCCESS;
    }
}
